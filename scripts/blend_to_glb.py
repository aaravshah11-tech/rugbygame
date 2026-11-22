# Converts a Quaternius .blend character to GLB with every action baked (legs use IK).
# Usage (Blender as a Python module):  pip install bpy && python scripts/blend_to_glb.py in.blend out.glb
# Then compress, keeping the per-part materials:
#   npx @gltf-transform/cli resample out.glb tmp.glb && npx @gltf-transform/cli meshopt tmp.glb public/models/rugby_player.glb
import bpy, sys
src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
# drop anything that isn't the character (cameras, lamps)
for o in list(bpy.data.objects):
    if o.type not in ('MESH', 'ARMATURE'):
        bpy.data.objects.remove(o, do_unlink=True)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
# Give every action a fake user and push each to an NLA track so the exporter sees all of them.
arm.animation_data_create()
for a in bpy.data.actions:
    a.use_fake_user = True
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_optimize_animation_size=True,
    export_skins=True,
    export_morph=False,
    export_yup=True,
    export_apply=False,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)
print('EXPORTED', out)
