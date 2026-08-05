---
title: Abaqus 圆环模型几何特征选取分析
date: 20260805
category: 代码
summary: 对一个 Abaqus Python 圆环分层模型脚本进行分析，重点说明面、圆边、径向边和 Tie 区域的几何特征选取方法。
---

# Abaqus 圆环模型几何特征选取分析

这段 Abaqus Python 脚本用于自动建立一个二维平面分层圆环模型。模型由中心圆盘 `Part-in`、若干中间圆环 `Part-1 ... Part-N`、以及最外层圆环 `Part-0` 组成。脚本随后为各层赋材料、装配实例、对最外层 `Part-0` 做坐标轴方向分割、建立 Tie 约束、施加外边界压力和对称边界条件，最后划分网格并创建作业。

脚本中最值得关注的是几何特征的选取方式。它没有依赖 Abaqus GUI 录制脚本里常见的 `getSequenceFromMask`，而是尽量通过几何坐标、半径、边界框和预期数量来选取面与边，因此比录制脚本更容易参数化，也更适合半径和层数变化的模型。

## 代码定位

本文重点分析以下几类几何选取：

- 截面赋值时如何选中圆盘或圆环的面。
- Tie 约束时如何选中相邻圆环的重合圆边。
- `Part-0` 被坐标轴分割后，为什么同一个圆边要按 4 段选取。
- 对称边界条件中，如何选中 `x` 轴和 `y` 轴上的径向边。
- 为什么脚本中加入了 `ensure_count` 检查。

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


def circular_edges(instance_obj, radius, expected_count=1, split_by_axes=False):
    if split_by_axes:
        coordinate_points = (
            (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
            (radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
        )
        find_at_args = tuple((point,) for point in coordinate_points)
        edges_obj = instance_obj.edges.findAt(*find_at_args)
        return ensure_count(edges_obj, expected_count, 'Circular edges at radius %s' % radius)

    edges_obj = instance_obj.edges.findAt(((radius / sqrt(2.0), radius / sqrt(2.0), 0.0),))
    return ensure_count(edges_obj, expected_count, 'Circular edge at radius %s' % radius)


def radial_edges_on_axis(instance_obj, inner_radius, outer_radius, axis, tolerance=1.0e-6):
    if axis == 'x':
        edges_obj = instance_obj.edges.getByBoundingBox(
            xMin=-outer_radius - tolerance,
            yMin=-tolerance,
            zMin=-tolerance,
            xMax=outer_radius + tolerance,
            yMax=tolerance,
            zMax=tolerance,
        )
        return ensure_count(edges_obj, 2, 'x-axis radial edges on Part-0')
    if axis == 'y':
        edges_obj = instance_obj.edges.getByBoundingBox(
            xMin=-tolerance,
            yMin=-outer_radius - tolerance,
            zMin=-tolerance,
            xMax=tolerance,
            yMax=outer_radius + tolerance,
            zMax=tolerance,
        )
        return ensure_count(edges_obj, 2, 'y-axis radial edges on Part-0')
    raise ValueError('Unknown axis: %s' % axis)


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


# Partition Part-0 by the global x and y axes.
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
partition_sketch.Line(point1=(0.0, part_0_inner), point2=(0.0, part_0_outer))
partition_sketch.Line(point1=(0.0, -part_0_outer), point2=(0.0, -part_0_inner))
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
        if outer_spec['inner_radius'] == inner_spec['outer_radius']:
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
        expected_count=4 if outer_is_part_0 else 1,
        split_by_axes=outer_is_part_0,
    )
    inner_edge = circular_edges(
        assembly_obj.instances[inner_instance_name],
        shared_radius,
        expected_count=4 if inner_is_part_0 else 1,
        split_by_axes=inner_is_part_0,
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

model.ExpressionField(
    description='',
    expression='(X*X - Y*Y)/(X*X + Y*Y)',
    localCsys=None,
    name='AnalyticalField-1',
)
model.Pressure(
    amplitude=UNSET,
    createStepName='Step-1',
    distributionType=FIELD,
    field='AnalyticalField-1',
    magnitude=1.0,
    name='Load-1',
    region=Region(
        side1Edges=circular_edges(
            assembly_obj.instances['Part-0-1'],
            part_0_outer,
            expected_count=4,
            split_by_axes=True,
        )
    ),
)

# On Part-0, apply Y symmetry on x-axis radial edges and X symmetry on y-axis radial edges.
part_0_instance = assembly_obj.instances['Part-0-1']
model.YsymmBC(
    createStepName='Step-1',
    localCsys=None,
    name='BC-1',
    region=Region(edges=radial_edges_on_axis(part_0_instance, part_0_inner, part_0_outer, 'x')),
)
model.XsymmBC(
    createStepName='Step-1',
    localCsys=None,
    name='BC-2',
    region=Region(edges=radial_edges_on_axis(part_0_instance, part_0_inner, part_0_outer, 'y')),
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

脚本通过 `layer_count` 和 `radii` 定义分层圆环。

```python
layer_count = 2
radii = [1.0, 2.0, 3.0, 4.0]
```

当前模型对应：

- `Part-in`：中心圆盘，半径范围 `0 ~ 1`。
- `Part-1`：第一层圆环，半径范围 `1 ~ 2`。
- `Part-2`：第二层圆环，半径范围 `2 ~ 3`。
- `Part-0`：最外层圆环，半径范围 `3 ~ 4`。

这里的 `Part-0` 不是中心层，而是最外层。它比较特殊，因为后续会在装配层级用全局 `x`、`y` 轴把它分割成 4 个象限方向的区域。

## 整体流程概览

脚本的执行顺序可以概括为：

1. 定义层数、半径、材料参数和网格尺寸。
2. 检查输入参数是否合理。
3. 根据半径自动生成每一层的 `part_specs`。
4. 创建中心圆盘和各层圆环。
5. 创建材料和截面，并把截面赋给各个 Part。
6. 在 Assembly 中实例化所有 Part。
7. 对最外层 `Part-0` 做坐标轴分割。
8. 建立静力分析步。
9. 自动寻找相邻层公共圆边，并建立 Tie 约束。
10. 在最外圆边施加解析场控制的压力。
11. 在 `Part-0` 的坐标轴径向边施加对称边界条件。
12. 对所有实例划分网格。
13. 创建 Abaqus Job。

这是一种典型的参数化建模脚本写法：前面用少量参数描述模型，后面所有几何、材料、约束、载荷和网格都由脚本自动生成。

## 参数与校验

脚本最开始定义核心参数：

```python
layer_count = 2
radii = [1.0, 2.0, 3.0, 4.0]
material_props = {
    0: (1.0, 0.2),
    1: (1.0, 0.2),
    2: (1.0, 0.2),
}
seed_size = 0.1
```

`layer_count` 表示中间圆环层数，不包括中心圆盘 `Part-in` 和最外层 `Part-0`。

`radii` 的长度必须是：

```python
layer_count + 2
```

原因是半径列表需要提供：

- 中心圆盘外半径。
- 每个中间层的外半径。
- 最外层 `Part-0` 的外半径。

脚本做了两个关键校验：

```python
if len(radii) != layer_count + 2:
    raise ValueError('radii must contain layer_count + 2 values')
```

以及：

```python
if radii[radius_index + 1] <= radii[radius_index]:
    raise ValueError('radii must be strictly increasing')
```

这保证了半径数量正确，并且半径严格递增。否则圆环可能出现零厚度或负厚度。

材料参数也做了缺失检查：

```python
required_material_ids = set(range(layer_count + 1))
missing_material_ids = required_material_ids - set(material_props.keys())
```

这里需要的材料编号是 `0 ... layer_count`。其中 `Material-0` 同时给中心圆盘 `Part-in` 和最外层 `Part-0` 使用。

## 分层信息生成

脚本没有手动为每个 Part 写重复代码，而是生成 `part_specs` 列表。

中心圆盘：

```python
part_specs.append({
    'id': 'in',
    'name': part_name('in'),
    'inner_radius': 0.0,
    'outer_radius': radii[0],
    'material_id': 0,
})
```

中间层：

```python
for layer_id in range(1, layer_count + 1):
    part_specs.append({
        'id': layer_id,
        'name': part_name(layer_id),
        'inner_radius': radii[layer_id - 1],
        'outer_radius': radii[layer_id],
        'material_id': layer_id,
    })
```

最外层：

```python
part_specs.append({
    'id': 0,
    'name': part_name(0),
    'inner_radius': radii[layer_count],
    'outer_radius': radii[layer_count + 1],
    'material_id': 0,
})
```

这样做的好处是：后面创建几何、赋材料、装配、划分网格时都可以遍历 `part_specs`，而不是为每一层写一段几乎相同的代码。

## 圆盘和圆环的创建

中心圆盘通过一个圆生成。

```python
def make_disk(part_name, radius):
    sketch_obj = model.ConstrainedSketch(name='__profile__', sheetSize=4.0 * radius)
    sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(radius, 0.0))
    part_obj = model.Part(
        dimensionality=TWO_D_PLANAR,
        name=part_name,
        type=DEFORMABLE_BODY,
    )
    part_obj.BaseShell(sketch=sketch_obj)
```

圆环通过两个同心圆生成。

```python
def make_annulus(part_name, inner_radius, outer_radius):
    sketch_obj = model.ConstrainedSketch(name='__profile__', sheetSize=4.0 * outer_radius)
    sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(inner_radius, 0.0))
    sketch_obj.CircleByCenterPerimeter(center=(0.0, 0.0), point1=(outer_radius, 0.0))
    part_obj.BaseShell(sketch=sketch_obj)
```

几何中心始终在 `(0, 0)`，所有圆都是同心圆。这一点非常重要，因为后续的边选取全部建立在“圆心固定、半径已知”的假设上。

## 材料和截面

脚本根据 `material_props` 自动创建材料和截面。

```python
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
```

每个材料编号对应一个 `Material-*` 和一个 `Section-*`。材料本构使用线弹性：

```python
Elastic(table=((young_modulus, poisson_ratio),))
```

之后再遍历 `part_specs`，根据每个 Part 的 `material_id` 分配截面。

```python
assign_section(
    model.parts[part_spec['name']],
    'Section-%d' % part_spec['material_id'],
    part_spec['inner_radius'],
    part_spec['outer_radius'],
)
```

因此，材料分配逻辑和几何层定义绑定在一起。只要修改 `part_specs` 或 `material_props`，截面赋值会自动跟着变化。

## 面的选取：截面赋值

截面赋值由 `assign_section` 完成。

```python
def assign_section(part_obj, section_name, inner_radius, outer_radius):
    if inner_radius == 0.0:
        face_point = (0.0, 0.0, 0.0)
    else:
        mid_radius = 0.5 * (inner_radius + outer_radius)
        face_point = (mid_radius / sqrt(2.0), mid_radius / sqrt(2.0), 0.0)

    face_obj = part_obj.faces.findAt((face_point,))
```

这里使用 `faces.findAt` 按点选面。

对于中心圆盘，选取点是圆心：

```python
face_point = (0.0, 0.0, 0.0)
```

因为圆盘面包含圆心，这个点一定在面内部。

对于圆环，选取点不是内外半径上的点，而是中间半径处、45 度方向上的点：

```python
mid_radius = 0.5 * (inner_radius + outer_radius)
face_point = (mid_radius / sqrt(2.0), mid_radius / sqrt(2.0), 0.0)
```

这个点的半径正好是：

```text
sqrt((mid_radius/sqrt(2))^2 + (mid_radius/sqrt(2))^2) = mid_radius
```

因此它位于内半径和外半径之间，必然落在圆环面内部，而不是边界上。

选择 45 度方向还有一个好处：它避开了 `x` 轴和 `y` 轴。如果某些圆环之后被坐标轴分割，轴线附近可能是边界或分割线；用对角线方向的内部点选面更稳。

## `findAt` 选取策略

`findAt` 的核心逻辑是：给 Abaqus 一个几何实体上的坐标点，让 Abaqus 返回包含该点的面、边或顶点。

这类选取有两个要求：

- 点必须落在目标几何实体上，不能偏离。
- 点最好不要落在多个实体的交界处，否则选择可能不稳定。

脚本中选面时用圆环中线上的点，选圆边时用圆周 45 度位置上的点，都是为了避免点落在交界处。

## 圆形边的选取

圆形边选取由 `circular_edges` 完成。

```python
def circular_edges(instance_obj, radius, expected_count=1, split_by_axes=False):
    if split_by_axes:
        coordinate_points = (
            (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
            (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
            (radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
        )
        find_at_args = tuple((point,) for point in coordinate_points)
        edges_obj = instance_obj.edges.findAt(*find_at_args)
        return ensure_count(edges_obj, expected_count, 'Circular edges at radius %s' % radius)

    edges_obj = instance_obj.edges.findAt(((radius / sqrt(2.0), radius / sqrt(2.0), 0.0),))
    return ensure_count(edges_obj, expected_count, 'Circular edge at radius %s' % radius)
```

当圆边没有被分割时，只需要一个点。

```python
edges_obj = instance_obj.edges.findAt(((radius / sqrt(2.0), radius / sqrt(2.0), 0.0),))
```

这个点位于半径为 `radius` 的圆周上，角度约为 45 度。

对于未分割的圆环边，一个完整圆通常是一个 edge，所以 `expected_count=1`。

## 为什么 `Part-0` 的圆边要选 4 段

脚本对最外层 `Part-0` 做了坐标轴分割。

```python
partition_sketch.Line(point1=(-part_0_outer, 0.0), point2=(-part_0_inner, 0.0))
partition_sketch.Line(point1=(part_0_inner, 0.0), point2=(part_0_outer, 0.0))
partition_sketch.Line(point1=(0.0, part_0_inner), point2=(0.0, part_0_outer))
partition_sketch.Line(point1=(0.0, -part_0_outer), point2=(0.0, -part_0_inner))
assembly_obj.PartitionFaceBySketch(faces=partition_faces, sketch=partition_sketch)
```

这 4 条线分别位于：

- 正 `x` 轴方向。
- 负 `x` 轴方向。
- 正 `y` 轴方向。
- 负 `y` 轴方向。

它们把 `Part-0` 的圆环面切成 4 个象限区域。分割之后，`Part-0` 的内圆边和外圆边也会被坐标轴交点切开。于是原本一个完整圆边不再是 1 条 edge，而变成 4 条圆弧 edge。

因此，凡是选 `Part-0` 的圆边，都需要：

```python
split_by_axes=True
expected_count=4
```

脚本用 4 个象限中点来选取这 4 段圆弧。

```python
coordinate_points = (
    (radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
    (-radius / sqrt(2.0), radius / sqrt(2.0), 0.0),
    (-radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
    (radius / sqrt(2.0), -radius / sqrt(2.0), 0.0),
)
```

这 4 个点分别在 4 个象限的 45 度、135 度、225 度、315 度方向。它们都避开了坐标轴分割线，因此不会落在分割顶点上。

这个写法比用圆周上的轴向点更稳。例如 `(radius, 0, 0)` 正好位于分割点，可能对应多条边的交界，不适合 `findAt`。

## Tie 约束中的边选取

脚本自动寻找相邻圆环之间的公共半径。

```python
tie_pairs = []
for outer_spec in part_specs:
    for inner_spec in part_specs:
        if outer_spec['id'] == inner_spec['id']:
            continue
        if outer_spec['inner_radius'] == inner_spec['outer_radius']:
            tie_pairs.append((outer_spec, inner_spec, outer_spec['inner_radius']))
```

判断条件是：

```python
outer_spec['inner_radius'] == inner_spec['outer_radius']
```

也就是说，一个外侧圆环的内半径等于一个内侧圆环的外半径。这个共同半径就是二者接触的位置。

之后分别在两个实例上选中这条圆边：

```python
outer_edge = circular_edges(
    assembly_obj.instances[outer_instance_name],
    shared_radius,
    expected_count=4 if outer_is_part_0 else 1,
    split_by_axes=outer_is_part_0,
)
inner_edge = circular_edges(
    assembly_obj.instances[inner_instance_name],
    shared_radius,
    expected_count=4 if inner_is_part_0 else 1,
    split_by_axes=inner_is_part_0,
)
```

这里的关键是：是否按 4 段选取，不取决于半径本身，而取决于该边所在的实例是不是 `Part-0`。

因为只有 `Part-0` 被坐标轴分割，其他圆环没有被分割，所以其他层同一半径上的圆边仍然通常是 1 条 edge。

Tie 区域随后用 `side1Edges` 构造：

```python
model.Tie(
    main=Region(side1Edges=outer_edge),
    secondary=Region(side1Edges=inner_edge),
)
```

对于二维平面 shell 几何，圆环边界作为 shell face 的边，需要用 `side1Edges` 指定 Tie 的边区域。

## 装配与实例

脚本在 Assembly 中为每个 Part 创建一个独立实例。

```python
assembly_obj = model.rootAssembly
assembly_obj.DatumCsysByDefault(CARTESIAN)

for part_spec in part_specs:
    assembly_obj.Instance(
        dependent=OFF,
        name=instance_name(part_spec['id']),
        part=model.parts[part_spec['name']],
    )
```

`dependent=OFF` 表示创建独立实例。后续分割、网格等操作发生在装配实例层面。

实例命名由 `instance_name` 统一生成：

```python
def instance_name(part_id):
    return '%s-1' % part_name(part_id)
```

例如：

- `Part-in` 对应 `Part-in-1`。
- `Part-1` 对应 `Part-1-1`。
- `Part-0` 对应 `Part-0-1`。

统一命名能避免后续手动拼写实例名时出错。

## 分析步

脚本创建了一个静力分析步。

```python
model.StaticStep(name='Step-1', previous='Initial')
```

所有 Tie 约束、压力载荷和边界条件都在这个模型基础上定义，其中压力和对称边界条件明确施加在 `Step-1`。

由于这是二维平面模型，且材料为线弹性，静力步适合用于观察在给定压力场和边界约束下的位移、应力或反力响应。

## 外边界压力的选取

外边界压力施加在 `Part-0` 的外半径 `part_0_outer` 上。

```python
model.Pressure(
    distributionType=FIELD,
    field='AnalyticalField-1',
    magnitude=1.0,
    name='Load-1',
    region=Region(
        side1Edges=circular_edges(
            assembly_obj.instances['Part-0-1'],
            part_0_outer,
            expected_count=4,
            split_by_axes=True,
        )
    ),
)
```

由于 `Part-0` 已经被分割，外圆边是 4 条圆弧，所以这里同样使用 `split_by_axes=True` 和 `expected_count=4`。

如果这里仍按 1 条边选取，会漏选外边界的 3/4 圆弧，导致压力只施加在一个象限上。

压力的空间分布由解析场控制。

```python
model.ExpressionField(
    expression='(X*X - Y*Y)/(X*X + Y*Y)',
    name='AnalyticalField-1',
)
```

这个表达式依赖全局坐标 `X` 和 `Y`。在极坐标意义下：

```text
(X^2 - Y^2)/(X^2 + Y^2) = cos(2 theta)
```

因此外边界压力不是常值分布，而是随角度变化的二阶谐波型分布。压力定义中：

```python
distributionType=FIELD
field='AnalyticalField-1'
magnitude=1.0
```

表示基础幅值为 `1.0`，实际空间分布由 `AnalyticalField-1` 调制。

## 径向边的选取

对称边界条件施加在 `Part-0` 的坐标轴径向边上。径向边选取由 `radial_edges_on_axis` 完成。

```python
def radial_edges_on_axis(instance_obj, inner_radius, outer_radius, axis, tolerance=1.0e-6):
    if axis == 'x':
        edges_obj = instance_obj.edges.getByBoundingBox(
            xMin=-outer_radius - tolerance,
            yMin=-tolerance,
            zMin=-tolerance,
            xMax=outer_radius + tolerance,
            yMax=tolerance,
            zMax=tolerance,
        )
        return ensure_count(edges_obj, 2, 'x-axis radial edges on Part-0')
    if axis == 'y':
        edges_obj = instance_obj.edges.getByBoundingBox(
            xMin=-tolerance,
            yMin=-outer_radius - tolerance,
            zMin=-tolerance,
            xMax=tolerance,
            yMax=outer_radius + tolerance,
            zMax=tolerance,
        )
        return ensure_count(edges_obj, 2, 'y-axis radial edges on Part-0')
```

这里没有用 `findAt`，而是用 `getByBoundingBox`。

原因是坐标轴径向边有两条：

- `x` 轴方向包括正 `x` 轴和负 `x` 轴两条径向边。
- `y` 轴方向包括正 `y` 轴和负 `y` 轴两条径向边。

用边界框可以一次性选中轴线上所有边。

对于 `x` 轴，选取条件是 `y` 接近 0：

```python
yMin=-tolerance
yMax=tolerance
xMin=-outer_radius - tolerance
xMax=outer_radius + tolerance
```

这会框住整条 `x` 轴附近的几何边。由于 `Part-0` 是圆环，真正落在这个框里的边是两段径向边：

- 从 `x = inner_radius` 到 `x = outer_radius`。
- 从 `x = -outer_radius` 到 `x = -inner_radius`。

对于 `y` 轴，逻辑类似，只是改成 `x` 接近 0。

```python
xMin=-tolerance
xMax=tolerance
yMin=-outer_radius - tolerance
yMax=outer_radius + tolerance
```

## 对称边界条件的几何含义

脚本把 `YsymmBC` 施加在 `x` 轴径向边上。

```python
model.YsymmBC(
    region=Region(edges=radial_edges_on_axis(part_0_instance, part_0_inner, part_0_outer, 'x')),
)
```

`YsymmBC` 通常表示关于 `y=0` 平面的对称条件。在二维平面中，`y=0` 就是 `x` 轴。因此它应该施加在 `x` 轴上的边。

脚本把 `XsymmBC` 施加在 `y` 轴径向边上。

```python
model.XsymmBC(
    region=Region(edges=radial_edges_on_axis(part_0_instance, part_0_inner, part_0_outer, 'y')),
)
```

`XsymmBC` 表示关于 `x=0` 平面的对称条件。在二维平面中，`x=0` 就是 `y` 轴。因此它应该施加在 `y` 轴上的边。

这一点命名上容易看反：`YsymmBC` 不是施加在 `y` 轴上，而是施加在法向为 `Y` 的对称面上，也就是 `x` 轴。

## 网格划分

脚本对所有实例使用统一的全局种子尺寸。

```python
assembly_obj.seedPartInstance(
    deviationFactor=0.1,
    minSizeFactor=0.1,
    regions=tuple(mesh_instances),
    size=seed_size,
)
assembly_obj.generateMesh(regions=tuple(mesh_instances))
```

`mesh_instances` 来自所有 `part_specs`：

```python
mesh_instances = []
for part_spec in part_specs:
    mesh_instances.append(assembly_obj.instances[instance_name(part_spec['id'])])
```

这保证中心圆盘、中间圆环和最外圆环都会一起划分网格。

`seed_size = 0.1` 控制网格尺寸。对于当前最大半径为 4 的模型，这个网格尺寸较细；如果层数或半径增大，可以相应调整。

## 作业创建

最后脚本创建 Abaqus 作业。

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

这里只创建作业，并没有提交计算。如果要自动提交并等待完成，可以在脚本末尾继续添加：

```python
mdb.jobs['Job-test'].submit()
mdb.jobs['Job-test'].waitForCompletion()
```

当前写法更适合先在 Abaqus/CAE 中检查模型、几何选取、Tie、边界条件和网格是否正确，再手动提交。

## `ensure_count` 的作用

几何选择后都会调用 `ensure_count`。

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

这是非常有价值的防错设计。几何脚本最常见的问题不是语法错误，而是“选错了对象但脚本仍然继续运行”。

例如：

- 原本应选 4 段外圆边，但只选到 1 段。
- 原本应选 2 条径向边，但因为分割失败选到 0 条。
- 半径或分割方式改变后，拓扑数量发生变化。

`ensure_count` 会在发现数量不符合预期时立即报错。这样可以把错误定位在几何选择阶段，而不是等到求解结果异常时才发现。

## 为什么不用 `getSequenceFromMask`

Abaqus GUI 录制脚本中常见类似写法：

```python
edges = instance.edges.getSequenceFromMask(mask=('[#4 ]',),)
```

这种写法依赖 Abaqus 内部的几何编号或掩码。几何稍微改变，比如层数变化、分割顺序变化、半径变化，掩码就可能失效或指向错误边。

当前脚本使用的是几何语义：

- 圆边通过半径和圆周点选取。
- 轴线边通过边界框选取。
- Tie 边通过相邻层的共同半径自动推断。
- `Part-0` 是否分割通过 `split_by_axes` 显式控制。

这使脚本更适合参数化建模。

## 需要注意的潜在问题

1. `findAt` 点必须准确落在边上

   圆周点通过 `radius / sqrt(2.0)` 构造，理论上准确落在圆上。对于当前解析圆几何，这种做法比较稳。

2. `Part-0` 分割后边数量固定为 4

   脚本假设 `Part-0` 的内外圆边被 `x`、`y` 轴切成 4 段。如果以后改变分割方式，`expected_count=4` 需要同步修改。

3. `radial_edges_on_axis` 没有使用 `inner_radius`

   函数参数中传入了 `inner_radius`，但边界框只使用了 `outer_radius` 和 `tolerance`。这在当前模型中仍然能选中正确的两条轴向径向边，因为圆环空洞区域没有边。但如果模型中增加了其他位于轴线附近的几何，这个边界框可能选到额外边。

4. Tie 主从面选择需要结合物理含义检查

   脚本把外侧圆环的内边作为 `main`，内侧圆环的外边作为 `secondary`。在当前同心圆分层模型中这是合理的自动化规则，但如果不同层网格密度差异较大，仍建议检查主从边设置。

5. `Part-0` 是特殊层

   只有 `Part-0` 被分割并承担外边界压力和对称边界条件。如果以后希望其他层也被分割，`circular_edges` 的 `split_by_axes` 逻辑需要推广，而不能只判断 `part_id == 0`。

## 适合复用的几何选取模式

这个脚本中最值得保留的模式是：

- 用“内部点”选面，不选边界点。
- 用“象限中点”选分割后的圆弧边，不选坐标轴交点。
- 用 `getByBoundingBox` 批量选轴线边。
- 用 `ensure_count` 验证选取数量。
- 用半径关系自动生成 Tie 约束对。

这些做法能显著减少参数化 Abaqus 脚本中由几何编号变化带来的不稳定性。

## 简短总结

这段脚本的几何选取策略是比较稳健的：它把模型的几何信息抽象成半径、层号和坐标轴，而不是依赖 GUI 录制得到的内部编号。对于圆环类模型，`findAt` 配合 45 度圆周点、`getByBoundingBox` 配合轴线窄框、再加上 `ensure_count` 数量检查，是一套清晰且可维护的选取方案。
