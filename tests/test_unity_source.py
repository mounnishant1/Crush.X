"""Source/asset checks only. These tests do not compile Unity or prove device behavior.
CRUSHX_UNITY_PROJECT can target an unmodified PR snapshot for regression evidence.
Optional C# syntax check requires tree-sitter and tree-sitter-c-sharp.
"""
import json
import os
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
PROJECT=Path(os.getenv('CRUSHX_UNITY_PROJECT',ROOT/'UnityProjects'/'CrushXLensEngine'))
ASSETS=PROJECT/'Assets'

def source(relative):return (ASSETS/relative).read_text()
def blocks(text):return re.split(r'(?=--- !u!)',text)

def guid_map():
    result={}
    for meta in ASSETS.rglob('*.meta'):
        guid=re.search(r'^guid: ([0-9a-f]{32})\s*$',meta.read_text(),re.M)
        if guid:result.setdefault(guid[1],[]).append(Path(str(meta)[:-5]))
    return result

class UnitySourceTests(unittest.TestCase):
    def test_metadata_and_asset_guid_integrity(self):
        mapping=guid_map()
        self.assertTrue(mapping)
        for guid,paths in mapping.items():
            self.assertEqual(len(paths),1,f'Duplicate GUID {guid}: {paths}')
            self.assertTrue(paths[0].exists(),f'Orphan .meta: {paths[0]}')
        for p in ASSETS.rglob('*'):
            if p.is_file() and p.suffix!='.meta':self.assertTrue(Path(str(p)+'.meta').is_file(),f'Missing .meta: {p}')

    def test_build_scene_paths_and_local_file_ids(self):
        settings=(PROJECT/'ProjectSettings/EditorBuildSettings.asset').read_text()
        scenes=re.findall(r'path: (.+)\n\s+guid: ([a-f0-9]+)',settings)
        self.assertTrue(scenes)
        for path,guid in scenes:
            asset=PROJECT/path
            self.assertTrue(asset.is_file(),path)
            self.assertIn('guid: '+guid,Path(str(asset)+'.meta').read_text())
        for asset in list(ASSETS.rglob('*.unity'))+list(ASSETS.rglob('*.prefab')):
            text=asset.read_text();ids=re.findall(r'^--- !u!\d+ &(-?\d+)',text,re.M)
            self.assertEqual(len(ids),len(set(ids)),f'Duplicate fileID: {asset}')
            for ref in re.finditer(r'\{fileID: (-?\d+)([^}]*)\}',text):
                if ref[1]!='0' and 'guid:' not in ref[2]:self.assertIn(ref[1],ids,f'Dangling local fileID in {asset}: {ref[1]}')

    def test_known_local_guid_references_and_types(self):
        mapping=guid_map();checked=0
        for p in ASSETS.rglob('*'):
            if p.suffix not in ('.unity','.prefab','.mat','.asset'):continue
            text=p.read_text()
            for guid in re.findall(r'guid: ([0-9a-f]{32})',text):
                if guid in mapping:
                    checked+=1;self.assertTrue(mapping[guid][0].exists())
            for guid in re.findall(r'm_Script:.*guid: ([0-9a-f]{32})',text):
                if guid in mapping:self.assertEqual(mapping[guid][0].suffix,'.cs')
        self.assertGreater(checked,10)

    def test_fox_obj_topology_texture_and_prefab_references(self):
        folder=ASSETS/'CrushX/ImportedLenses/FoxMask/Model'
        counts={'v':0,'vt':0,'vn':0};faces=[]
        for line in (folder/'FoxMask_Mobile.obj').read_text().splitlines():
            parts=line.split()
            if not parts:continue
            if parts[0] in counts:counts[parts[0]]+=1
            if parts[0]=='f':faces.append(parts[1:])
            if parts[0]=='mtllib':self.assertTrue((folder/parts[1]).is_file())
        self.assertGreater(counts['v'],0);self.assertTrue(faces)
        for face in faces:
            self.assertGreaterEqual(len(face),3)
            for vertex in face:
                for key,value in zip(('v','vt','vn'),vertex.split('/')):
                    if value:self.assertTrue(0<abs(int(value))<=counts[key],f'Invalid OBJ {key} index {value}')
        for texture in re.findall(r'^map_Kd (.+)',(folder/'FoxMask_Mobile.mtl').read_text(),re.M):self.assertTrue((folder/texture).is_file())
        self.assertTrue((folder/'FoxMask_Color.jpg').read_bytes().startswith(b'\xff\xd8\xff'))
        self.assertTrue((folder/'FoxMask_Thumbnail.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
        prefab=source('CrushX/ImportedLenses/FoxMask/FoxMask_AR.prefab')
        for name in ('FoxMask_Mobile.obj','FoxMask_Unity.mat'):
            guid=re.search(r'^guid: (\w+)',(folder/(name+'.meta')).read_text(),re.M)[1]
            self.assertIn(guid,prefab)

    def test_android_xr_loader_auto_start(self):
        text=source('XR/XRGeneralSettingsPerBuildTarget.asset')
        android=next(b for b in blocks(text) if 'm_Name: Android Providers' in b)
        self.assertIn('m_AutomaticLoading: 1',android)
        self.assertIn('m_AutomaticRunning: 1',android)
        loader_guid=re.search(r'm_Loaders:\s*- \{fileID: \d+, guid: (\w+)',android)[1]
        self.assertEqual(guid_map()[loader_guid][0].name,'ARCoreLoader.asset')

    def test_android_startup_reaches_native_scene(self):
        runtime=source('Scripts/Runtime/LensRuntimeEntry.cs')
        self.assertIn('UNITY_ANDROID && !UNITY_EDITOR',runtime)
        self.assertIn('SceneManager.LoadScene("CrushXNativeAR")',runtime)
        self.assertIn('SceneManager.sceneLoaded',runtime)
        self.assertIn('Application.CanStreamedLevelBeLoaded',runtime)

    def test_fox_is_selectable_and_not_an_always_on_overlay(self):
        self.assertIn('new LensManifest("fox-mask-3d"',source('Scripts/Runtime/LensCatalog.cs'))
        engine=source('Scripts/Runtime/LensEngineBootstrap.cs')
        self.assertIn('ISceneLens',engine)
        self.assertLess(engine.index('manifest.Value.SceneProvided && !sceneLensAvailable'),engine.index('Destroy(effect.gameObject)'))
        self.assertIn('sceneLens.SelectLens(id)',engine)
        fox=source('CrushX/ImportedLenses/FoxMask/Scripts/FoxMaskARLens.cs')
        self.assertIn('MonoBehaviour, ISceneLens',fox)
        self.assertIn('if (!selectionSet)',fox)
        self.assertIn('enabledOnStart: 0',source('SCENES/CrushXNativeAR.unity'))

    def test_material_selection_matches_active_render_pipeline(self):
        fox=source('CrushX/ImportedLenses/FoxMask/Scripts/FoxMaskARLens.cs')
        installer=source('CrushX/ImportedLenses/FoxMask/Scripts/Editor/FoxMaskInstaller.cs')
        for code in (fox,installer):self.assertIn('GraphicsSettings.currentRenderPipeline == null',code)
        conversions=source('Scripts/Lenses/CompatibleLensMaterials.cs')
        self.assertIn('new Material(source)',conversions)
        self.assertIn('compatibleMaterials.Dispose()',fox)
        self.assertIn('Resources.Load<Material>("CrushXLenses/FoxMaskBuiltIn")',fox)

    def test_single_swipe_owner_and_canceled_touch_handling(self):
        ui=source('Scripts/Runtime/NativeLensUI.cs');swipe=source('Scripts/Runtime/CrushXCameraSwipe.cs')
        self.assertIn('RequireComponent(typeof(CrushXCameraSwipe))',ui)
        self.assertIn('gameObject.AddComponent<CrushXCameraSwipe>()',ui)
        self.assertNotIn('engine.Step(',ui)
        self.assertIn('if (canceled) return;',swipe)
        self.assertIn('pressed > 1',swipe)
        self.assertIn('Touchscreen.current',swipe)
        self.assertIn('ENABLE_LEGACY_INPUT_MANAGER',swipe)

    def test_single_touch_identity_and_permission_recovery_guards(self):
        swipe=source('Scripts/Runtime/CrushXCameraSwipe.cs')
        gate=source('Scripts/Runtime/CrushXCameraPermissionGate.cs')
        # Static contracts only: these do not replace real multi-touch/device checks.
        self.assertIn('private int activeTouchId = -1;',swipe)
        self.assertIn('activeTouchId != touchId',swipe)
        self.assertIn('waitForAllReleased = true; return;',swipe)
        self.assertIn('touch.touchId.ReadValue()',swipe)
        self.assertIn('touch.fingerId',swipe)
        self.assertIn('activeTouchId = -1;',swipe)
        self.assertIn('RequestPending = false;',gate)
        self.assertIn('Permission.RequestUserPermission(Permission.Camera, callbacks);',gate)
        self.assertIn('catch (System.Exception ex)',gate)
        self.assertIn('Time.realtimeSinceStartup - requestedAt > 35f',gate)
        self.assertNotIn('Permission.RequestUserPermission(Permission.Camera, new PermissionCallbacks())',gate)

    def test_all_original_procedural_lenses_retained(self):
        ids=set(re.findall(r'new LensManifest\("([^"]+)"',source('Scripts/Runtime/LensCatalog.cs')))
        self.assertTrue({'cat-ears','puppy','cyber-visor','fox','holo-crown','butterfly','robo-helmet','celestial-halo','neon-mask','dragon'}<=ids)
        engine=source('Scripts/Runtime/LensEngineBootstrap.cs')
        self.assertIn('public bool PreferResourcePrefabs;',engine)
        self.assertIn('GameObject prefab = PreferResourcePrefabs ?',engine)

    def test_scene_tools_preserve_paths_and_build_scenes(self):
        for name in ('CrushXSceneTools','CrushXNativeARSceneTools'):
            code=source(f'Editor/{name}.cs')
            self.assertIn('Assets/SCENES',code)
            self.assertNotIn('Assets/Scenes',code)
            self.assertIn('EditorBuildSettings.scenes)',code)
            self.assertIn('scenes.Exists',code)

    def test_android_and_direct_dependency_configuration(self):
        manifest=json.loads((PROJECT/'Packages/manifest.json').read_text())['dependencies']
        lock=json.loads((PROJECT/'Packages/packages-lock.json').read_text())['dependencies']
        for name,version in manifest.items():
            self.assertEqual(lock[name]['version'],version,name)
            self.assertEqual(lock[name]['depth'],0,name)
        self.assertEqual(manifest['com.unity.xr.arfoundation'],'6.0.8')
        self.assertEqual(manifest['com.unity.xr.arcore'],'6.0.8')
        self.assertIn('com.unity.inputsystem',manifest)
        asm=json.loads(source('Scripts/CrushXLensEngine.Runtime.asmdef'))
        self.assertIn('Unity.InputSystem',asm['references'])
        settings=(PROJECT/'ProjectSettings/ProjectSettings.asset').read_text()
        self.assertIn('activeInputHandler: 1',settings)
        self.assertIn('scriptingBackend:\n    Android: 1',settings)
        self.assertIn('AndroidTargetArchitectures: 2',settings)
        self.assertIn('AndroidMinSdkVersion: 24',settings)

    def test_fox_clears_instances_if_face_subsystem_stops(self):
        fox=source('CrushX/ImportedLenses/FoxMask/Scripts/FoxMaskARLens.cs')
        self.assertRegex(fox,r'!faceManager.subsystem.running\)\s*\{\s*ClearInstances\("[^"\n]+"\);')
        self.assertIn('TrackingState.Tracking',fox)
        provider=source('Scripts/Tracking/ARFoundationFaceProvider.cs')
        self.assertIn('FaceManager.subsystem.running',provider)
        self.assertIn('TrackingState.Tracking',provider)

    def test_carousel_and_swipe_share_stable_browse_order(self):
        engine=source('Scripts/Runtime/LensEngineBootstrap.cs')
        selection=engine[engine.index('public bool SelectLens'):engine.index('public void Step')]
        self.assertNotIn('ranking = personalization.Ranked()',selection)
        carousel=source('Scripts/Runtime/CrushXSmartCarousel.cs')
        self.assertIn('engine.RankedLenses',carousel)
        self.assertNotIn('preferences.Ranked()',carousel)

    def test_delayed_rig_and_controls_have_retry_paths(self):
        engine=source('Scripts/Runtime/LensEngineBootstrap.cs')
        ui=source('Scripts/Runtime/NativeLensUI.cs')
        entry=source('Scripts/Runtime/LensRuntimeEntry.cs')
        self.assertIn('private void TryBindNativeRig()',engine)
        self.assertGreaterEqual(engine.count('TryBindNativeRig();'),2)
        self.assertIn('FindObjectsInactive.Include',engine)
        self.assertIn('CameraFacingDirection.User',engine)
        self.assertRegex(engine,r'#if UNITY_EDITOR \|\| UNITY_STANDALONE\s+if \(Camera.main == null\)')
        self.assertIn('private void ResolveDependencies()',ui)
        self.assertGreaterEqual(ui.count('ResolveDependencies();'),3)
        self.assertIn('Preparing camera controls',ui)
        self.assertIn('FindFirstObjectByType<NativeLensUI>(FindObjectsInactive.Include)',entry)
        self.assertIn('CrushX Native Lens UI (recovery)',entry)

    def test_circular_selector_and_fox_calibration_are_explicit(self):
        carousel=source('Scripts/Runtime/CrushXSmartCarousel.cs')
        fox=source('CrushX/ImportedLenses/FoxMask/Scripts/FoxMaskARLens.cs')
        self.assertIn('public static Rect BubbleRect',carousel)
        self.assertIn('GUI.DrawTexture(bubble, bubbleTexture',carousel)
        self.assertIn('localScaleMultiplier = 1f',fox)
        self.assertIn('localPositionOffset = Vector3.zero',fox)
        self.assertIn('if (instance != null) ApplyCalibration(instance)',fox)

    def test_installed_only_category_browsing_combines_all_filters(self):
        carousel=source('Scripts/Runtime/CrushXSmartCarousel.cs')
        layout=source('Scripts/Runtime/NativeCameraLayout.cs')
        ui=source('Scripts/Runtime/NativeLensUI.cs')
        tests=source('Tests/EditMode/NativeCameraInteractionTests.cs')
        for token in ('AvailableCategories(', 'NextCategory(', 'SetCategory(',
                      'LensCategory? category = null', 'Matches(lens, term, category)'):
            self.assertIn(token,carousel)
        self.assertIn('layout.Categories',ui)
        self.assertIn('CycleCategory(-1)',ui)
        self.assertIn('CycleCategory(1)',ui)
        self.assertIn('public Rect Categories',layout)
        self.assertIn('CategoryCombinesWithFavoritesRecentAndSearch',tests)
        self.assertIn('observedActiveId != engine.ActiveId',carousel)

    def test_csharp_syntax_only_not_unity_compilation(self):
        try:
            from tree_sitter import Language,Parser
            import tree_sitter_c_sharp
        except ImportError:self.skipTest('Optional C# parser unavailable; Unity compilation is also not executed.')
        parser=Parser(Language(tree_sitter_c_sharp.language()))
        def preprocess(text,defines):
            # Parse each target separately: a C# #if may legally contain only the else
            # branch of an ordinary if, which a raw syntax tree cannot combine correctly.
            def condition(expr):
                self.assertRegex(expr,r'^[A-Za-z0-9_&|!() \t]+$')
                expr=re.sub(r'\b[A-Za-z_]\w*\b',lambda m:str(m[0] in defines),expr)
                expr=expr.replace('&&',' and ').replace('||',' or ').replace('!',' not ')
                return bool(eval(expr,{'__builtins__':{}},{}))
            stack=[];enabled=True;output=[]
            for line in text.splitlines():
                directive=re.match(r'\s*#(if|elif|else|endif)\b(.*)',line)
                if directive:
                    kind,expr=directive.groups();expr=expr.strip()
                    if kind=='if':
                        selected=condition(expr);stack.append([enabled,selected]);enabled=enabled and selected
                    elif kind=='elif':
                        parent,seen=stack[-1];selected=condition(expr);enabled=parent and not seen and selected;stack[-1][1]=seen or selected
                    elif kind=='else':
                        parent,seen=stack[-1];enabled=parent and not seen;stack[-1][1]=True
                    else:enabled=stack.pop()[0]
                    output.append('')
                else:output.append(line if enabled else '')
            self.assertFalse(stack,'Unclosed preprocessor branch')
            return ('\n'.join(output)+'\n').encode()
        targets=[{'UNITY_ANDROID','ENABLE_INPUT_SYSTEM'},
                 {'UNITY_EDITOR','UNITY_STANDALONE','ENABLE_INPUT_SYSTEM'},
                 {'UNITY_EDITOR','UNITY_STANDALONE','ENABLE_LEGACY_INPUT_MANAGER'},
                 {'UNITY_ANDROID','ENABLE_LEGACY_INPUT_MANAGER'},
                 {'UNITY_ANDROID','DEVELOPMENT_BUILD','ENABLE_INPUT_SYSTEM'},
                 {'UNITY_EDITOR','UNITY_ANDROID','ENABLE_INPUT_SYSTEM'}]
        for p in ASSETS.rglob('*.cs'):
            for defines in targets:
                tree=parser.parse(preprocess(p.read_text(),defines))
                self.assertFalse(tree.root_node.has_error,f'C# syntax parser error in {p}, defines {defines}')

if __name__=='__main__':unittest.main(verbosity=2)
