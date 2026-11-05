"""Static source checks only. Does not certify Unity compilation/device QA."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Assets" / "Scripts"
CAT = SRC / "Runtime" / "LensCatalog.cs"
MODEL = ROOT / "Assets" / "StreamingAssets" / "CrushXModels" / "face_landmarker.task"


class LensSafetyChecks(unittest.TestCase):
    def test_catalog_has_37_unique_resolvable_original_lenses(self):
        catalog = CAT.read_text(encoding="utf8")
        ids = re.findall(r'new LensManifest\("([^"]+)"', catalog)
        mappings = dict(re.findall(
            r'case "([^"]+)": return typeof\((\w+)\)', catalog))
        self.assertEqual(37, len(ids))
        self.assertEqual(37, len(set(ids)))
        self.assertEqual(set(ids), set(mappings))
        sources = "\n".join(
            file.read_text(encoding="utf8") for file in SRC.rglob("*.cs"))
        for lens_name in mappings.values():
            self.assertRegex(
                sources, r"\bclass\s+" + re.escape(lens_name) + r"\b")

    def test_own_camera_stack_has_no_paid_sdk_link(self):
        config = json.loads((ROOT / "OpenLens" /
                             "approved-providers.json").read_text())
        for provider in config["providers"]:
            if provider["id"] in (
                "gpupixel", "snap-camera-kit", "deepar-sdk",
                "banuba-face-ar-sdk"):
                self.assertFalse(provider["packaged"], provider["id"])
        self.assertFalse(all(config["release_gates"].values()),
                         "Never mark unverified source as fully release-ready")

    def test_native_pipeline_keeps_privacy_and_model_gate(self):
        java = (ROOT / "Assets" / "AndroidNative" /
                "CrushXFaceLandmarkerBridge.java").read_text()
        self.assertIn(".setNumFaces(3)", java)
        self.assertIn("latestFaces.set(", java)
        self.assertIn("pollLatestFaces()", java)
        self.assertIn("detectForVideo(", java)
        gradle = (ROOT / "Assets" / "Editor" /
                  "CrushXMediaPipeAndroidGradle.cs").read_text()
        self.assertIn("SHA256.Create()", gradle)
        self.assertIn("MODEL-LICENSE-APPROVED", gradle)
        self.assertFalse(MODEL.exists(),
                         "Do not commit unapproved face model in source.")

    def test_render_graph_beauty_and_face_warp(self):
        for shader in ("CrushXOriginalBeauty.shader",
                       "CrushXFunnyFaceWarp.shader"):
            self.assertTrue((ROOT / "Assets" / "Shaders" / shader).is_file())
        for feature in ("CrushXBeautyRendererFeature.cs",
                        "FunnyFaceWarpRendererFeature.cs"):
            body = (SRC / "Runtime" / feature).read_text()
            self.assertIn("RecordRenderGraph", body)
            self.assertIn("requiresIntermediateTexture = true", body)
        body = (SRC / "Runtime" / "FaceWarpFrameSource.cs").read_text()
        self.assertIn("MaximumFrameAgeSeconds = .18f", body)
        self.assertIn("incoming.sequence <= lastSequence", body)

    def test_all_seven_lens_categories_exist_in_camera_navigation(self):
        discovery = (SRC / "Runtime" / "LensDiscovery.cs").read_text()
        ui = (SRC / "Runtime" / "NativeLensUI.cs").read_text()
        all_categories = [
            "All", "Beauty", "Alien", "Funny", "Trending",
            "Animals", "Sci-Fi", "Fantasy", "Aesthetic",
            "Favorites", "Recent"
        ]
        for name in all_categories:
            self.assertIn('"' + name + '"', discovery)
        self.assertIn("LensDiscovery.Collections", ui)
        self.assertIn("GUI.BeginScrollView", ui)
        self.assertIn("browseMenuOpen", ui)
        self.assertIn("pointerStartedInCollectionMenu", ui)
        self.assertIn("visible.Count == 0", (SRC / "Runtime" / "LensEngineBootstrap.cs").read_text())

    def test_favorites_and_recent_are_local_and_bounded(self):
        prefs = (SRC / "Runtime" / "LensPersonalization.cs").read_text()
        discovery = (SRC / "Runtime" / "LensDiscovery.cs").read_text()
        self.assertIn("MaximumRecent = 12", prefs)
        self.assertIn("RecentIds()", prefs)
        self.assertIn('PlayerPrefs.DeleteKey(Key("recent"))', prefs)
        self.assertIn('name == "Favorites"', discovery)
        self.assertIn('name == "Recent"', discovery)
        self.assertTrue((ROOT / "Assets" / "Tests" / "EditMode" /
                         "LensCollectionNavigationTests.cs").exists())

    def test_production_camera_toolkit_is_wired_with_fallback(self):
        toolkit = (SRC / "Runtime" / "LensCameraProductionUI.cs").read_text()
        editor = (ROOT / "Assets" / "Editor" /
                  "CrushXLensProductionUISetup.cs").read_text()
        scene_tools = (ROOT / "Assets" / "Editor" /
                       "CrushXNativeARSceneTools.cs").read_text()
        legacy = (SRC / "Runtime" / "NativeLensUI.cs").read_text()
        preflight = (ROOT / "Assets" / "Editor" /
                     "CrushXLensReleasePreflight.cs").read_text()
        self.assertIn("[RequireComponent(typeof(UIDocument))]", toolkit)
        self.assertIn("new ScrollView(ScrollViewMode.Horizontal)", toolkit)
        self.assertIn("Screen.safeArea", toolkit)
        self.assertIn("CapturePointer", toolkit)
        self.assertIn("previewArea.RegisterCallback<PointerDownEvent>", toolkit)
        self.assertIn("Mathf.Abs(delta.x) < width * .16f", toolkit)
        self.assertIn("multiTouchCancelled", toolkit)
        self.assertIn("Length.Percent(100)", toolkit)
        self.assertIn("LensDiscovery.Collections", toolkit)
        self.assertIn("EnsureInstalledForCurrentScene()", editor)
        self.assertIn("new GameObject(\"CrushX Production Camera UI\")", editor)
        self.assertIn("CrushXLensProductionUISetup.EnsureInstalledForCurrentScene()", scene_tools)
        self.assertIn("toolkitUI.IsReady", legacy)
        self.assertIn("Production camera UI controller", preflight)

    def test_production_favorites_are_isolated_by_authenticated_scope(self):
        source = (SRC / "Runtime" / "LensPersonalization.cs").read_text()
        engine = (SRC / "Runtime" / "LensEngineBootstrap.cs").read_text()
        receiver = (SRC / "Bridge" / "UnityLensReceiver.cs").read_text()
        unity_tests = (ROOT / "Assets" / "Tests" / "EditMode" /
                       "LensCollectionNavigationTests.cs").read_text()
        self.assertIn('private string scope = "guest";', source)
        self.assertIn("SHA256.Create()", source)
        self.assertIn("ConfigureAccountScope(string accountId)", source)
        self.assertIn('Key("recent")', source)
        self.assertIn("Max", source)
        self.assertIn("SelectLensInternal(visible[0].Id, false)", engine)
        self.assertIn("ConfigureAccountScope(string authenticatedAccountId)", engine)
        self.assertIn("SetLensAccountScope(string authenticatedAccountId)", receiver)
        self.assertIn("FavoritesAndRecentNeverLeakAcrossAuthenticatedAccounts", unity_tests)

    def test_games_group_comedy_and_opt_in_voice(self):
        data = (SRC / "Lenses" / "FunnyLensGames.cs").read_text()
        self.assertIn("rearmed = false;", data)
        self.assertIn("BlinkPopFunnyLens", data)
        self.assertIn("MouthCatchFunnyLens", data)
        self.assertIn("GroupPartyFunnyLens",
                      (SRC / "Tracking" / "MultiFaceFunnyOverlay.cs").read_text())
        voice = (SRC / "Runtime" / "FunnyVoiceEffects.cs").read_text()
        self.assertIn("StartPreviewAfterConsent()", voice)
        self.assertIn("Microphone.End", voice)
        self.assertIn("RequestUserPermission", voice)

    def test_runtime_scripts_and_meta_files_match(self):
        for file in list(SRC.rglob("*.cs")) + list(
                (ROOT / "Assets" / "Editor").rglob("*.cs")):
            self.assertTrue(Path(str(file) + ".meta").is_file(), str(file))


if __name__ == "__main__":
    unittest.main()
