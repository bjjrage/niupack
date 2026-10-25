"""Offline photographic render of the exact showroom meshes and artwork.

Run with Blender --background --python cycles.py -- [--only=ID,ID] [--preview].
GLB inputs come from render.mts; no logos, text, silhouettes or UVs are rebuilt.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import struct
import time

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("--only")
parser.add_argument("--preview", action="store_true")
parser.add_argument("--samples", type=int, default=48)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
requested = set(args.only.split(",")) if args.only else {item["id"] for item in manifest}
unknown = requested - {item["id"] for item in manifest}
if unknown:
    raise ValueError(f"Unknown products: {sorted(unknown)}")
output = ROOT / "output" / ("cycles-preview" if args.preview else "cycles")
output.mkdir(parents=True, exist_ok=True)


def socket(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def paper_material(material, coordinate_origin):
    """Add physical paper response while retaining imported base-colour links."""
    material.use_backface_culling = False
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return
    if bsdf.inputs["Alpha"].default_value < 0.5:
        socket(bsdf, "Roughness", 0.12)
        return  # Preserve the existing clear lid, including its transparency.
    coords = nodes.new("ShaderNodeTexCoord")
    coords.object = coordinate_origin
    coarse = nodes.new("ShaderNodeTexNoise")
    coarse.inputs["Scale"].default_value = 3300
    coarse.inputs["Detail"].default_value = 2
    coarse.inputs["Roughness"].default_value = 0.7
    fine = nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 18000
    fine.inputs["Detail"].default_value = 2
    links.new(coords.outputs["Object"], coarse.inputs["Vector"])
    links.new(coords.outputs["Object"], fine.inputs["Vector"])
    fibres = nodes.new("ShaderNodeMixRGB")
    fibres.blend_type = "MULTIPLY"
    fibres.inputs[0].default_value = 0.65
    links.new(coarse.outputs["Fac"], fibres.inputs[1])
    links.new(fine.outputs["Fac"], fibres.inputs[2])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.28
    bump.inputs["Distance"].default_value = 0.00007
    links.new(fibres.outputs["Color"], bump.inputs["Height"])
    for link in list(bsdf.inputs["Normal"].links):
        links.remove(link)
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    roughness = nodes.new("ShaderNodeMapRange")
    roughness.inputs["From Min"].default_value = 0
    roughness.inputs["From Max"].default_value = 1
    roughness.inputs["To Min"].default_value = 0.54
    roughness.inputs["To Max"].default_value = 0.83
    links.new(coarse.outputs["Fac"], roughness.inputs["Value"])
    for link in list(bsdf.inputs["Roughness"].links):
        links.remove(link)
    links.new(roughness.outputs["Result"], bsdf.inputs["Roughness"])
    socket(bsdf, "Metallic", 0)
    socket(bsdf, "IOR", 1.47)
    socket(bsdf, "Specular IOR Level", 0.25)
    socket(bsdf, "Coat Weight", 0.025)
    socket(bsdf, "Coat Roughness", 0.65)
    socket(bsdf, "Sheen Weight", 0.055)
    socket(bsdf, "Sheen Roughness", 0.9)


def area_light(scene, name, location, target, energy, width, height):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.size_y = energy, "RECTANGLE", width, height
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()


for item in manifest:
    identifier = item["id"]
    if identifier not in requested:
        continue
    started = time.monotonic()
    source = ROOT / "output" / f"{identifier}.glb"
    if not source.is_file():
        raise FileNotFoundError(f"Export the exact showroom scene first: {source}")
    binary = source.read_bytes()
    json_length = struct.unpack_from("<I", binary, 12)[0]
    gltf = json.loads(binary[20:20 + json_length])
    frame = next(node["extras"] for node in gltf["nodes"] if "camera" in node and "showroomFrameHeight" in node.get("extras", {}))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = list(scene.objects)
    root = bpy.data.objects.new("millimetre-scale", None)
    scene.collection.objects.link(root)
    for obj in imported:
        if obj.parent is None:
            obj.parent = root
    # Native geometry uses 1 unit = 100 mm. Keep the imported camera and all
    # meshes together so composition, proportions and UV placement stay exact.
    root.scale = (0.1, 0.1, 0.1)
    camera = next(obj for obj in imported if obj.type == "CAMERA")
    # Use the recorded source frame directly; glTF importer/exporter camera
    # magnification conventions must not change the catalogue composition.
    camera.data.ortho_scale = max(frame["showroomFrameHeight"], frame["showroomFrameWidth"]) * 0.1
    scene.camera = camera
    bpy.context.view_layer.update()
    meshes = [obj for obj in imported if obj.type == "MESH"]
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    height = high.z - low.z
    diameter = high.x - low.x
    extent = max(height, diameter)
    target = (low + high) / 2
    coordinate_origin = bpy.data.objects.new("paper-world-coordinates", None)
    scene.collection.objects.link(coordinate_origin)
    for material in {material for obj in meshes for material in obj.data.materials if material}:
        paper_material(material, coordinate_origin)
    power = (extent / 0.1) ** 2
    area_light(scene, "large softbox", Vector((-1.5 * extent, -2 * extent, 2.4 * extent)), target, 0.60 * power, 1.8 * extent, 2.6 * extent)
    area_light(scene, "soft fill card", Vector((1.7 * extent, -0.6 * extent, 1.3 * extent)), target, 0.168 * power, 2.0 * extent, 2.4 * extent)
    area_light(scene, "rim softbox", Vector((0.7 * extent, 1.4 * extent, 1.9 * extent)), target, 0.24 * power, 1.1 * extent, 2.2 * extent)
    world = bpy.data.worlds.new("neutral studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.1
    scene.world = world
    bpy.ops.mesh.primitive_plane_add(size=extent * 8, location=(0, 0, low.z - 0.0002))
    bounce_card = bpy.context.object
    bounce_card.name = "invisible floor bounce card"
    bounce_card.visible_camera = False
    floor_material = bpy.data.materials.new("matte neutral bounce")
    floor_material.diffuse_color = (0.35, 0.35, 0.35, 1)
    bounce_card.data.materials.append(floor_material)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.035
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.cycles.transmission_bounces = 4
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 6
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_x, scene.render.resolution_y = (1440, 960) if identifier.startswith("pot-") else (1200, 1800)
    scene.render.resolution_percentage = 50 if args.preview else 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.3
    scene.render.filepath = str(output / f"{identifier}.png")
    print(f"STARTING {identifier}", flush=True)
    bpy.ops.render.render(write_still=True)
    receipt = {"id": identifier, "engine": "Blender Cycles", "blender": bpy.app.version_string,
               "samples": args.samples, "preview": args.preview, "seconds": round(time.monotonic() - started, 2),
               "geometry": {"meshes": len(meshes), "boundsMetres": {"min": list(low), "max": list(high)}},
               "preserved": ["original meshes", "original camera", "original artwork links and UVs", "transparent background"]}
    (output / f"{identifier}.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"RENDERED {identifier} in {receipt['seconds']}s", flush=True)
