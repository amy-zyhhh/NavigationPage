---
title: Abaqus 圆环模型几何特征选取分析
date: 20260805
category: 代码
summary: 分析优化后的 Abaqus Python 圆环分层建模脚本，重点说明面、圆边、上下半圆边、Tie 区域以及压力和剪切载荷区域的几何特征选取方法。
---

# Abaqus 圆环模型几何特征选取分析

这段 Abaqus Python 脚本用于自动建立一个二维平面分层圆环模型。模型由中心圆盘 `Part-in`、若干中间圆环 `Part-1 ... Part-N`、以及最外层圆环 `Part-0` 组成。脚本会自动创建几何、材料、截面、装配实例、Tie 约束、外边界压力、外边界剪切载荷、网格和 Job。

优化后的版本和上一版最大的区别是：`Part-0` 只沿全局 `x` 轴分割，不再同时沿 `x`、`y` 两个坐标轴分割；外圆边因此按上下半圆来组织，压力作用在外圆边整体，剪切载荷则分别作用在上半圆和下半圆，并使用相反的切向参考方向。

## 代码定位

本文重点整理以下几类几何特征选取：

- 截面赋值时，如何用内部点选中圆盘或圆环面。
- Tie 约束中，如何按公共半径选中相邻圆环的重合边。
- `Part-0` 只按 `x` 轴分割后，为什么圆边按 2 段处理。
- 上半圆和下半圆剪切载荷区域如何选取。
- `ensure_count` 如何帮助检查几何选取是否符合预期。

## 完整代码

```python
from abaqus import *
from part import *
from material import *
from section import *
from assembly import *
from step import *
from interaction import *
from load import *
from mesh import *
from job import *
from sketch import *
from regionToolset import Region
from abaqusConstants import *
from math import sqrt


# -----------------------------
# Variables
# -----------------------------

# Number of intermediate annular layers: Part-1 ... Part-N.
# This does not include Part-in or Part-0.
layer_count = 2

# Radii: Part-in is 0~1, Part-1 is 1~2, Part-2 is 2~3,
# and Part-0 is 3~4. Therefore this two-layer model has no Part-3.
radii = [1.0, 2.0, 3.0, 4.0]

# Material parameters: material id -> (Young's modulus, Poisson's ratio).
# Material-0 is used by both Part-0 and Part-in.
material_props = {
    0: (1.0, 0.2),
    1: (1.0, 0.2),
    2: (1.0, 0.2),
}

# Mesh seed size for every instance.
seed_size = 0.1

# Tolerance for detecting coincident circular boundaries.
radius_tolerance = 1.0e-9

# Load magnitudes and spatial field definitions.
pressure_magnitude = 1.0
pressure_field_expression = '(2*X*Y)/(X*X + Y*Y)'
shear_magnitude = 1.0
shear_field_expression = '(2*X*Y)/(X*X + Y*Y)'


# -----------------------------
# Validation and derived data
# -----------------------------

# Start from a clean CAE database so the script can be rerun after a failed run.
Mdb()
model = mdb.models['Model-1']

if len(radii) != layer_count + 2:
    raise ValueError('radii must contain layer_count + 2 values')

for radius_index in range(len(radii) - 1):
    if radii[radius_index + 1] <= radii[radius_index]:
        raise ValueError('radii must be strictly increasing')

required_material_ids = set(range(layer_count + 1))
missing_material_ids = required_material_ids - set(material_props.keys())
if missing_material_ids:
    raise ValueError('Missing material properties: %s' % sorted(missing_material_ids))


def part_name(part_id):
    if part_id == 'in':
        return 'Part-in'
    return 'Part-%s' % part_id


def instance_name(part_id):
    return '%s-1' % part_name(part_id)


part_specs = []
part_specs.append({
    'id': 'in',
    'name': part_name('in'),
    'inner_radius': 0.0,
    'outer_radius': radii[0],
    'material_id': 0,
})

for layer_id in range(1, layer_count + 1):
    part_specs.append({
        'id': layer_id,
        'name': part_name(layer_id),
        'inner_radius': radii[layer_id - 1],
        'outer_radius': radii[layer_id],
        'material_id': layer_id,
    })

part_specs.append({
    'id': 0,
    'name': part_name(0),
    'inner_radius': radii[layer_count],
    'outer_radius': radii[layer_count + 1],
    'material_id': 0,
})

part_specs_by_id = {}
for part_spec in part_specs:
    part_specs_by_id[part_spec['id']] = part_spec

part_0_spec = part_specs_by_id[0]
part_0_inner = part_0_spec['inner_radius']
part_0_outer = part_0_spec['outer_radius']


# -----------------------------
# Helpers
# -----------------------------


def make_disk(part_name, radius):
    sketch_obj = model.ConstrainedSketch(name='__profile__', sheetSize=4.0 * radius)
    sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(radius, 0.0))
    part_obj = model.Part(
        dimensionality=TWO_D_PLANAR,
        name=part_name,
        type=DEFORMABLE_BODY,
    )
    part_obj.BaseShell(sketch=sketch_obj)
    del model.sketches['__profile__']
    return part_obj


def make_annulus(part_name, inner_radius, outer_radius):
    sketch_obj = model.ConstrainedSketch(name='__profile__', sheetSize=4.0 * outer_radius)
    sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(inner_radius, 0.0))
    sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(outer_radius, 0.0))
    part_obj = model.Part(
        dimensionality=TWO_D_PLANAR,
        name=part_name,
        type=DEFORMABLE_BODY,
    )
    part_obj.BaseShell(sketch=sketch_obj)
    del model.sketches['__profile__']
    return part_obj


def assign_section(part_obj, section_name, inner_radius, outer_radius):
    if inner_radius == 0.0:
        face_point = (0.0, 0.0, 0.0)
    else:
        mid_radius = 0.5 * (inner_radius + outer_radius)
        face_point = (mid_radius / sqrt(2.0), mid_radius / sqrt(2.0), 0.0)

    face_obj = part_obj.faces.findAt((face_point,))
    part_obj.SectionAssignment(
        offset=0.0,
        offsetField='',
        offsetType=MIDDLE_SURFACE,
        region=Region(faces=face_obj),
        sectionName=section_name,
        thicknessAssignment=FROM_SECTION,
    )


def ensure_count(sequence_obj, expected_count, description):
    actual_count = len(sequence_obj)
    if actual_count != expected_count:
        raise ValueError(
            '%s: expected %d item(s), got %d' %
            (description, expected_count, actual_count)
        )
    return sequence_obj


def circular_edges(instance_obj, radius, expected_count=1, split_by_x_axis=False):
    if split_by_x_axis:
        coordinate_points = (
            (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
        )
        find_at_args = tuple((point,) for point in coordinate_points)
        edges_obj = instance_obj.edges.findAt(*find_at_args)
        return ensure_count(edges_obj, expected_count, 'Circular edges at radius %s' % radius)

    edges_obj = instance_obj.edges.findAt(((radius / sqrt(2.0), radius / sqrt(2.0), 0.0),))
    return ensure_count(edges_obj, expected_count, 'Circular edge at radius %s' % radius)


def circular_edges_half(instance_obj, radius, half):
    if half == 'upper':
        coordinate_points = (
            (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
        )
    elif half == 'lower':
        coordinate_points = (
            (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
            (radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
        )
    else:
        raise ValueError('Unknown circular half: %s' % half)

    find_at_args = tuple((point,) for point in coordinate_points)
    edges_obj = instance_obj.edges.findAt(*find_at_args)
    return ensure_count(edges_obj, 2, '%s circular edges at radius %s' % (half, radius))


# -----------------------------
# Geometry
# -----------------------------

for part_spec in part_specs:
    if part_spec['inner_radius'] == 0.0:
        make_disk(part_spec['name'], part_spec['outer_radius'])
    else:
        make_annulus(
            part_spec['name'],
            part_spec['inner_radius'],
            part_spec['outer_radius'],
        )


# -----------------------------
# Materials and sections
# -----------------------------

for material_id in sorted(material_props.keys()):
    material_name = 'Material-%d' % material_id
    section_name = 'Section-%d' % material_id
    young_modulus, poisson_ratio = material_props[material_id]

    model.Material(name=material_name)
    model.materials[material_name].Elastic(table=((young_modulus, poisson_ratio),))
    model.HomogeneousSolidSection(
        material=material_name,
        name=section_name,
        thickness=None,
    )

for part_spec in part_specs:
    assign_section(
        model.parts[part_spec['name']],
        'Section-%d' % part_spec['material_id'],
        part_spec['inner_radius'],
        part_spec['outer_radius'],
    )


# -----------------------------
# Assembly
# -----------------------------

assembly_obj = model.rootAssembly
assembly_obj.DatumCsysByDefault(CARTESIAN)

for part_spec in part_specs:
    assembly_obj.Instance(
        dependent=OFF,
        name=instance_name(part_spec['id']),
        part=model.parts[part_spec['name']],
    )


# Partition Part-0 by the global x-axis only.
part_0_instance = assembly_obj.instances['Part-0-1']
part_0_mid = 0.5 * (part_0_inner + part_0_outer)
# Before partitioning, Part-0 has exactly one annular face.
partition_face = part_0_instance.faces[0]
partition_faces = part_0_instance.faces
partition_sketch = model.ConstrainedSketch(
    gridSpacing=part_0_outer / 10.0,
    name='__profile__',
    sheetSize=4.0 * part_0_outer,
    transform=assembly_obj.MakeSketchTransform(
        sketchPlane=partition_face,
        sketchPlaneSide=SIDE1,
        sketchOrientation=RIGHT,
        origin=(0.0, 0.0, 0.0),
    ),
)
assembly_obj.projectReferencesOntoSketch(filter=COPLANAR_EDGES, sketch=partition_sketch)
partition_sketch.Line(point1=(-part_0_outer, 0.0), point2=(-part_0_inner, 0.0))
partition_sketch.Line(point1=(part_0_inner, 0.0), point2=(part_0_outer, 0.0))
assembly_obj.PartitionFaceBySketch(faces=partition_faces, sketch=partition_sketch)
del model.sketches['__profile__']


# -----------------------------
# Step, constraints, load, and boundary conditions
# -----------------------------

model.StaticStep(name='Step-1', previous='Initial')

# Tie every coincident circular boundary, using the model radii as topology data.
tie_pairs = []
for outer_spec in part_specs:
    for inner_spec in part_specs:
        if outer_spec['id'] == inner_spec['id']:
            continue
        if abs(outer_spec['inner_radius'] - inner_spec['outer_radius']) <= radius_tolerance:
            tie_pairs.append((outer_spec, inner_spec, outer_spec['inner_radius']))

for outer_spec, inner_spec, shared_radius in tie_pairs:
    outer_instance_name = instance_name(outer_spec['id'])
    inner_instance_name = instance_name(inner_spec['id'])
    constraint_name = 'Constraint-%s-%s' % (outer_spec['id'], inner_spec['id'])

    outer_is_part_0 = outer_spec['id'] == 0
    inner_is_part_0 = inner_spec['id'] == 0
    outer_edge = circular_edges(
        assembly_obj.instances[outer_instance_name],
        shared_radius,
        expected_count=2 if outer_is_part_0 else 1,
        split_by_x_axis=outer_is_part_0,
    )
    inner_edge = circular_edges(
        assembly_obj.instances[inner_instance_name],
        shared_radius,
        expected_count=2 if inner_is_part_0 else 1,
        split_by_x_axis=inner_is_part_0,
    )
    model.Tie(
        adjust=ON,
        main=Region(side1Edges=outer_edge),
        name=constraint_name,
        positionToleranceMethod=COMPUTED,
        secondary=Region(side1Edges=inner_edge),
        thickness=ON,
        tieRotations=ON,
    )

if pressure_magnitude != 0.0:
    model.ExpressionField(
        description='',
        expression=pressure_field_expression,
        localCsys=None,
        name='PressureField',
    )
    model.Pressure(
        amplitude=UNSET,
        createStepName='Step-1',
        distributionType=FIELD,
        field='PressureField',
        magnitude=pressure_magnitude,
        name='PressureLoad',
        region=Region(
            side1Edges=circular_edges(
                assembly_obj.instances['Part-0-1'],
                part_0_outer,
                expected_count=2,
                split_by_x_axis=True,
            )
        ),
    )

if shear_magnitude != 0.0:
    model.ExpressionField(
        description='',
        expression=shear_field_expression,
        localCsys=None,
        name='ShearField',
    )
    model.SurfaceTraction(
        amplitude=UNSET,
        createStepName='Step-1',
        directionVector=((0.0, 0.0, 0.0), (1.0, 0.0, 0.0)),
        distributionType=FIELD,
        field='ShearField',
        localCsys=None,
        magnitude=shear_magnitude,
        name='ShearLoad-Upper',
        region=Region(
            side1Edges=circular_edges_half(
                assembly_obj.instances['Part-0-1'],
                part_0_outer,
                'upper',
            )
        ),
    )
    model.SurfaceTraction(
        amplitude=UNSET,
        createStepName='Step-1',
        directionVector=((0.0, 0.0, 0.0), (-1.0, 0.0, 0.0)),
        distributionType=FIELD,
        field='ShearField',
        localCsys=None,
        magnitude=shear_magnitude,
        name='ShearLoad-Lower',
        region=Region(
            side1Edges=circular_edges_half(
                assembly_obj.instances['Part-0-1'],
                part_0_outer,
                'lower',
            )
        ),
    )


# -----------------------------
# Mesh and job
# -----------------------------

mesh_instances = []
for part_spec in part_specs:
    mesh_instances.append(assembly_obj.instances[instance_name(part_spec['id'])])

assembly_obj.seedPartInstance(
    deviationFactor=0.1,
    minSizeFactor=0.1,
    regions=tuple(mesh_instances),
    size=seed_size,
)
assembly_obj.generateMesh(regions=tuple(mesh_instances))

mdb.Job(
    atTime=None,
    contactPrint=OFF,
    description='',
    echoPrint=OFF,
    explicitPrecision=SINGLE,
    getMemoryFromAnalysis=True,
    historyPrint=OFF,
    memory=90,
    memoryUnits=PERCENTAGE,
    model='Model-1',
    modelPrint=OFF,
    name='Job-test',
    nodalOutputPrecision=SINGLE,
    numCpus=1,
    numGPUs=0,
    queue=None,
    resultsFormat=ODB,
    scratch='',
    type=ANALYSIS,
    userSubroutine='',
    waitHours=0,
    waitMinutes=0,
)
```

## 模型几何结构

脚本通过 `layer_count` 和 `radii` 定义分层圆环：

```python
layer_count = 2
radii = [1.0, 2.0, 3.0, 4.0]
```

当前模型对应：

- `Part-in`：中心圆盘，半径范围 `0 ~ 1`。
- `Part-1`：第一层圆环，半径范围 `1 ~ 2`。
- `Part-2`：第二层圆环，半径范围 `2 ~ 3`。
- `Part-0`：最外层圆环，半径范围 `3 ~ 4`。

这里的 `Part-0` 是最特殊的一层。它既参与和内侧圆环的 Tie 连接，又承受外边界载荷；同时它在装配层级被全局 `x` 轴切开，用于区分上半圆和下半圆。

## 整体流程

脚本执行顺序可以概括为：

1. 定义层数、半径、材料、网格尺寸、容差和载荷参数。
2. 检查半径数量、半径递增关系和材料编号是否完整。
3. 生成 `part_specs`，把每一层的名称、内外半径和材料编号统一保存。
4. 创建中心圆盘和各层圆环。
5. 创建材料与截面，并按几何内部点给每个 Part 赋截面。
6. 在 Assembly 中实例化所有 Part。
7. 只沿全局 `x` 轴分割 `Part-0`。
8. 创建静力分析步。
9. 根据相邻层公共半径自动建立 Tie 约束。
10. 在 `Part-0` 外圆边施加解析场控制的压力。
11. 在 `Part-0` 外圆上、下半圆分别施加剪切面力。
12. 对所有实例统一划分网格。
13. 创建 Abaqus Job。

## 参数与校验

`radii` 的长度必须是：

```python
layer_count + 2
```

原因是半径列表需要包含中心圆盘外半径、每个中间圆环外半径、以及最外层 `Part-0` 的外半径。脚本同时检查半径是否严格递增：

```python
if radii[radius_index + 1] <= radii[radius_index]:
    raise ValueError('radii must be strictly increasing')
```

优化后的脚本还加入了 `radius_tolerance`：

```python
radius_tolerance = 1.0e-9
```

它用于判断两个圆边半径是否重合。相比直接使用 `==` 判断浮点数，容差判断更稳健，尤其适合半径由计算生成、而不是全部手动写死的情况。

载荷参数也被集中放在开头：

```python
pressure_magnitude = 1.0
pressure_field_expression = '(2*X*Y)/(X*X + Y*Y)'
shear_magnitude = 1.0
shear_field_expression = '(2*X*Y)/(X*X + Y*Y)'
```

当 `pressure_magnitude` 或 `shear_magnitude` 为 `0.0` 时，对应载荷不会创建，便于快速打开或关闭某类载荷。

## 分层信息生成

脚本没有为每一层手写重复代码，而是生成统一的 `part_specs` 列表。每个元素都记录：

- `id`：层编号。
- `name`：Part 名称。
- `inner_radius`：内半径。
- `outer_radius`：外半径。
- `material_id`：材料编号。

这种组织方式让后续创建几何、赋材料、实例化、Tie、网格划分都可以遍历 `part_specs` 完成。层数变化时，通常只需要改 `layer_count`、`radii` 和 `material_props`。

## 圆盘和圆环创建

中心圆盘由一个圆生成：

```python
sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(radius, 0.0))
part_obj.BaseShell(sketch=sketch_obj)
```

圆环由两个同心圆生成：

```python
sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(inner_radius, 0.0))
sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(outer_radius, 0.0))
part_obj.BaseShell(sketch=sketch_obj)
```

所有圆都以 `(0, 0)` 为圆心，这一点非常关键。后续所有边界选取都建立在“圆心固定、半径已知”的几何假设上。

## 面的选取

截面赋值由 `assign_section` 完成：

```python
if inner_radius == 0.0:
    face_point = (0.0, 0.0, 0.0)
else:
    mid_radius = 0.5 * (inner_radius + outer_radius)
    face_point = (mid_radius / sqrt(2.0), mid_radius / sqrt(2.0), 0.0)

face_obj = part_obj.faces.findAt((face_point,))
```

对于中心圆盘，圆心 `(0, 0, 0)` 一定位于面内部。对于圆环，脚本选取内外半径中间、且位于 45 度方向的点。这个点不会落在内圆边或外圆边上，也避开了坐标轴附近可能出现的分割边，因此比直接使用轴向点更稳。

## `findAt` 选取策略

`findAt` 的基本思想是：给 Abaqus 一个落在目标几何实体上的坐标点，让 Abaqus 返回包含这个点的面或边。

使用 `findAt` 时要注意两点：

- 点必须确实落在目标实体上。
- 点最好不要落在多个实体的交界处。

所以脚本选面时使用面内部点，选圆边时使用圆周上的非轴向点。这能减少因为点落在分割端点、相邻边交界或顶点位置而导致的选择不稳定。

## 圆形边的选取

圆形边通过 `circular_edges` 选取：

```python
def circular_edges(instance_obj, radius, expected_count=1, split_by_x_axis=False):
    if split_by_x_axis:
        coordinate_points = (
            (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
        )
        find_at_args = tuple((point,) for point in coordinate_points)
        edges_obj = instance_obj.edges.findAt(*find_at_args)
        return ensure_count(edges_obj, expected_count, 'Circular edges at radius %s' % radius)

    edges_obj = instance_obj.edges.findAt(((radius / sqrt(2.0), radius / sqrt(2.0), 0.0),))
    return ensure_count(edges_obj, expected_count, 'Circular edge at radius %s' % radius)
```

未分割的圆边通常是一整条 edge，因此只需要一个圆周点，`expected_count=1`。当 `Part-0` 被 `x` 轴分割后，同一条圆边会按上半圆和下半圆分成两段，所以使用两个采样点：

- `(r/sqrt(2), r/sqrt(2), 0)`：位于上半圆。
- `(-r/sqrt(2), -r/sqrt(2), 0)`：位于下半圆。

这两个点分别落在上下两个圆弧段内部，避开了 `x` 轴上的分割端点。

## `Part-0` 的 x 轴分割

优化后的脚本只画两条分割线：

```python
partition_sketch.Line(point1=(-part_0_outer, 0.0), point2=(-part_0_inner, 0.0))
partition_sketch.Line(point1=(part_0_inner, 0.0), point2=(part_0_outer, 0.0))
assembly_obj.PartitionFaceBySketch(faces=partition_faces, sketch=partition_sketch)
```

这两条线分别位于负 `x` 轴和正 `x` 轴方向，把最外层圆环切成上、下两个半环区域。分割后，`Part-0` 的内圆边和外圆边都会在 `x` 轴交点处被切开，后续在这个实例上选圆边时应按 2 段处理：

```python
expected_count=2
split_by_x_axis=True
```

上一版脚本同时按 `x`、`y` 轴分割，所以圆边按 4 段处理；优化后已经改成只按 `x` 轴分割，对应说明也应改为 2 段。

## 上下半圆边选取

剪切载荷使用 `circular_edges_half` 分别选取上半圆和下半圆：

```python
def circular_edges_half(instance_obj, radius, half):
    if half == 'upper':
        coordinate_points = (
            (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
        )
    elif half == 'lower':
        coordinate_points = (
            (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
            (radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
        )
```

上半圆的两个点分别位于第一象限和第二象限，下半圆的两个点分别位于第三象限和第四象限。这样写的意图是：用多个点覆盖目标半圆区域，避免只选到局部边段。

需要注意的是，这里的函数固定检查返回 `2` 条边：

```python
return ensure_count(edges_obj, 2, '%s circular edges at radius %s' % (half, radius))
```

如果 Abaqus 在某个版本或某种分割拓扑下把上半圆识别为一条连续 edge，那么这里可能返回 `1` 而不是 `2`。因此这段代码的 `expected_count=2` 本质上是在锁定当前脚本预期的拓扑结果；如果以后分割方式变化，应优先检查这里。

## Tie 约束中的边选取

Tie 对由相邻层的公共半径自动推断：

```python
if abs(outer_spec['inner_radius'] - inner_spec['outer_radius']) <= radius_tolerance:
    tie_pairs.append((outer_spec, inner_spec, outer_spec['inner_radius']))
```

这表示：如果一个外侧圆环的内半径和一个内侧圆环的外半径相等，那么这两个边界就是同一条物理交界面，需要建立 Tie。

后续根据实例是否为 `Part-0` 决定选取数量：

```python
outer_edge = circular_edges(
    assembly_obj.instances[outer_instance_name],
    shared_radius,
    expected_count=2 if outer_is_part_0 else 1,
    split_by_x_axis=outer_is_part_0,
)
```

关键点是：是否按 2 段选取，不取决于半径本身，而取决于这条边所在的实例是否经过 x 轴分割。只有 `Part-0` 被分割，所以 `Part-0` 上的圆边按 2 段选；其他 Part 没有分割，圆边通常按 1 条 edge 选。

Tie 区域使用：

```python
Region(side1Edges=outer_edge)
Region(side1Edges=inner_edge)
```

对于二维平面 shell 几何，圆环边界作为 shell face 的边参与 Tie，因此这里使用 `side1Edges` 构造区域。

## 压力载荷区域

压力载荷施加在 `Part-0` 的外圆边：

```python
region=Region(
    side1Edges=circular_edges(
        assembly_obj.instances['Part-0-1'],
        part_0_outer,
        expected_count=2,
        split_by_x_axis=True,
    )
)
```

由于外圆边被 `x` 轴切成上下两段，这里必须选中 2 条圆弧。如果只选一个圆周点，就可能只给上半圆或下半圆施加压力。

压力由解析场控制：

```python
pressure_field_expression = '(2*X*Y)/(X*X + Y*Y)'
```

在极坐标意义下：

```text
(2XY)/(X^2 + Y^2) = sin(2 theta)
```

因此压力不是常值分布，而是随角度变化的二阶谐波型分布。表达式分母在原点为零，但压力只施加在外圆边 `r = part_0_outer` 上，正常情况下不会在原点求值。

## 剪切载荷区域

剪切载荷也使用同一个形式的空间场：

```python
shear_field_expression = '(2*X*Y)/(X*X + Y*Y)'
```

脚本把剪切面力分成上半圆和下半圆两次施加：

```python
model.SurfaceTraction(
    directionVector=((0.0, 0.0, 0.0), (1.0, 0.0, 0.0)),
    name='ShearLoad-Upper',
    region=Region(side1Edges=circular_edges_half(..., 'upper')),
)
```

以及：

```python
model.SurfaceTraction(
    directionVector=((0.0, 0.0, 0.0), (-1.0, 0.0, 0.0)),
    name='ShearLoad-Lower',
    region=Region(side1Edges=circular_edges_half(..., 'lower')),
)
```

这样做把上半圆的参考方向设为正 `x`，下半圆的参考方向设为负 `x`。配合解析场后，可以表达沿外边界分布且上下半圆方向不同的剪切载荷。

## 装配与实例

脚本在 Assembly 中为每个 Part 创建一个独立实例：

```python
assembly_obj.Instance(
    dependent=OFF,
    name=instance_name(part_spec['id']),
    part=model.parts[part_spec['name']],
)
```

实例命名由 `instance_name` 统一生成，例如 `Part-1` 对应 `Part-1-1`。统一命名可以避免后续 Tie、载荷和网格操作中手写实例名出错。

`Part-0` 的分割发生在装配实例层级：

```python
part_0_instance = assembly_obj.instances['Part-0-1']
assembly_obj.PartitionFaceBySketch(faces=partition_faces, sketch=partition_sketch)
```

因此后续选取 `Part-0` 的分割圆边时，也要在 `assembly_obj.instances['Part-0-1']` 上操作。

## 材料和截面

材料由 `material_props` 自动创建：

```python
model.Material(name=material_name)
model.materials[material_name].Elastic(table=((young_modulus, poisson_ratio),))
```

截面命名为 `Section-0`、`Section-1`、`Section-2`。当前设置中，`Material-0` 同时用于中心圆盘 `Part-in` 和最外层 `Part-0`；中间层按 `layer_id` 使用对应材料。

## 分析步

脚本创建一个静力分析步：

```python
model.StaticStep(name='Step-1', previous='Initial')
```

Tie 约束、压力载荷和剪切载荷都基于这个分析步定义。优化后的代码没有再施加上一版中的 `XsymmBC` 和 `YsymmBC` 对称边界条件，因此模型约束状态需要结合实际物理问题另行检查，避免刚体位移或约束不足。

## 网格划分

所有实例统一使用 `seed_size` 播种：

```python
assembly_obj.seedPartInstance(
    deviationFactor=0.1,
    minSizeFactor=0.1,
    regions=tuple(mesh_instances),
    size=seed_size,
)
assembly_obj.generateMesh(regions=tuple(mesh_instances))
```

`mesh_instances` 来自全部 `part_specs`，所以中心圆盘、中间圆环和最外层圆环都会一起划分网格。当前 `seed_size = 0.1` 对最大半径为 `4.0` 的模型来说比较细；如果半径或层数增加，可以适当放大。

## Job 创建

最后创建 Abaqus Job：

```python
mdb.Job(
    model='Model-1',
    name='Job-test',
    type=ANALYSIS,
    numCpus=1,
    memory=90,
    memoryUnits=PERCENTAGE,
)
```

当前脚本只创建作业，没有自动提交。若希望直接计算，可以在脚本末尾添加：

```python
mdb.jobs['Job-test'].submit()
mdb.jobs['Job-test'].waitForCompletion()
```

保留只创建 Job 的写法，适合先在 Abaqus/CAE 中检查几何选取、Tie、载荷方向和网格质量。

## `ensure_count` 的作用

几何选取后都通过 `ensure_count` 检查数量：

```python
def ensure_count(sequence_obj, expected_count, description):
    actual_count = len(sequence_obj)
    if actual_count != expected_count:
        raise ValueError(
            '%s: expected %d item(s), got %d' %
            (description, expected_count, actual_count)
        )
    return sequence_obj
```

这是一种很有价值的防错设计。几何脚本最常见的问题不是语法错误，而是“选错了对象但脚本仍然继续运行”。例如：

- 本应选中 `Part-0` 外圆边的 2 段，但只选到 1 段。
- 本应选中上半圆区域，但返回的边数和预期不一致。
- 分割方式改变后，拓扑数量发生变化。

`ensure_count` 会在几何选择阶段立即报错，把问题定位在选区逻辑附近，而不是等到计算结果异常时才发现。

## 为什么不用 `getSequenceFromMask`

Abaqus GUI 录制脚本中常见：

```python
edges = instance.edges.getSequenceFromMask(mask=('[#4 ]',),)
```

这种写法依赖 Abaqus 内部的几何编号或掩码。只要层数、半径、分割顺序或拓扑略有变化，掩码就可能失效或指向错误对象。

当前脚本使用几何语义选取：

- 圆边通过半径和圆周点选取。
- 上下半圆通过象限采样点选取。
- Tie 边通过相邻层公共半径自动推断。
- `Part-0` 是否分割通过 `split_by_x_axis` 显式控制。
- 每次选取都通过 `ensure_count` 检查数量。

这种写法更适合参数化建模，也更容易维护。

## 需要注意的问题

1. `circular_edges_half` 的边数预期需要和实际拓扑一致  
   当前函数要求上半圆和下半圆各返回 `2` 条边。如果 Abaqus 实际只生成一条半圆 edge，需要把 `ensure_count` 的预期数量同步调整。

2. 优化后没有对称边界条件  
   上一版中对 `x`、`y` 轴径向边施加了 `YsymmBC` 和 `XsymmBC`。当前版本已经删除这些边界条件，因此求解前要确认载荷和 Tie 之外是否还需要位移约束。

3. `part_0_mid` 当前未被使用  
   脚本计算了 `part_0_mid`，但后续没有调用。它不影响运行，只是可以在清理代码时移除，或以后用于选面、标注、调试。

4. 解析场表达式只适用于非零半径位置  
   `(2*X*Y)/(X*X + Y*Y)` 在原点无定义。当前压力和剪切都施加在外圆边上，通常不会触发原点问题；若以后把场用于包含原点的区域，需要重新处理。

5. Tie 主从边仍应结合网格检查  
   当前规则把外侧圆环的内边作为 `main`，内侧圆环的外边作为 `secondary`。在同心分层模型中这是清晰的自动化规则，但如果不同层网格密度差异很大，仍建议在 CAE 中检查 Tie 区域。

## 可复用的几何选取模式

这段脚本中最值得保留的模式是：

- 用面内部点选面，不选边界点。
- 用圆周非轴向点选圆边，不选分割端点。
- 用象限采样点区分上半圆和下半圆。
- 用半径关系自动生成 Tie 约束对。
- 用容差判断浮点半径是否重合。
- 用 `ensure_count` 固化拓扑预期，及时暴露选取错误。

## 简短总结

优化后的脚本把 `Part-0` 的几何分割从“x、y 双轴四象限”改成了“x 轴上下半圆”。因此，圆边选取逻辑从 4 段变为 2 段，压力载荷选中整个外圆的上下两段，剪切载荷则进一步按上半圆和下半圆分别施加。整体上，这版代码更贴近“上下半圆分区加载”的需求，也比依赖 GUI 掩码的录制脚本更适合参数化复用。
