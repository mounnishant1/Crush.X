"""Source-level, fail-closed checks for the Step251 per-lens collection port.

Does NOT execute Unity tests or Android media capture. Tests only assert that
the new collection code is wired into the latest native camera without
replacing current AR/capture/permission/consent paths.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "UnityProjects" / "CrushXLensEngine" / "Assets"
SCRIPTS = ASSETS / "Scripts"


def content(path):
    return (ASSETS / path).read_text(encoding="utf-8")


class LatestLensCollectionPort(unittest.TestCase):
    def test_installed_lens_catalog_preserved_with_fox_scene_lens(self):
        source = content("Scripts/Runtime/LensCatalog.cs")
        self.assertEqual(11, len(re.findall(r'new LensManifest\("', source)))
        self.assertIn('"fox-mask-3d"', source)
        self.assertIn('case "fox-mask-3d": throw', source)

    def test_current_capture_permissions_and_media_lifecycle_remain(self):
        ui = content("Scripts/Runtime/NativeLensUI.cs")
        self.assertIn("NativeMediaCapture", ui)
        self.assertIn("CameraSession", ui)
        self.assertIn("CrushXCameraPermissionGate", ui)
        self.assertIn("ShutterGesture", ui)
        self.assertIn("capture.RequestPhoto()", ui)
        self.assertIn("capture.StartVideo(microphone)", ui)
        self.assertIn("capture.StopVideo()", ui)
        self.assertIn("capture.SavePreview()", ui)
        self.assertIn("gallery", ui.lower())

    def test_existing_personalization_consent_not_replaced(self):
        source = content("Scripts/Runtime/LensPersonalization.cs")
        self.assertIn('Prefix = "crushx.lens.v02."', source)
        self.assertIn("public bool UsageEnabled", source)
        self.assertIn("SetUsageEnabled(bool enabled)", source)
        self.assertIn("if (!UsageEnabled", source)
        self.assertIn("if (!enabled)", source)

    def test_private_folder_storage_scoped_and_allowlisted(self):
        source = content("Scripts/Runtime/LensCustomCollections.cs")
        self.assertIn('ScopePrefix = "crushx.lens.v03."', source)
        self.assertIn('accountScope = "guest"', source)
        self.assertIn("SHA256.Create()", source)
        self.assertIn("MaximumCollections = 20", source)
        self.assertIn("MaximumLenses = 64", source)
        self.assertIn("MaximumNameLength = 32", source)
        self.assertIn("MaximumStoredCharacters = 32768", source)
        self.assertIn("LensCatalog.Find(lensId).HasValue", source)
        self.assertIn("TryCreateWithLens", source)
        self.assertIn("ContainsLens", source)
        self.assertIn("PlayerPrefs.SetString(CollectionStorageKey", source)

    def test_per_lens_button_and_modal_block_swipes(self):
        ui = content("Scripts/Runtime/NativeLensUI.cs")
        sheet = content("Scripts/Runtime/LensCollectionSheet.cs")
        self.assertIn('"Save to"', ui)
        self.assertIn("collectionSheet.Open(engine.ActiveId", ui)
        self.assertIn("collectionSheet.IsOpen", ui)
        self.assertIn("collectionSheet.Draw(", ui)
        self.assertIn("collectionSheet.Close()", ui)
        self.assertIn("public bool Matches(", sheet)
        self.assertIn("TryCreateWithLens(newName, lensId", sheet)
        self.assertIn('saved ? "✓ Saved"', sheet)
        self.assertIn("Open(", sheet)
        self.assertIn("currentAccountEpoch", sheet)

    def test_same_native_carousel_supports_private_folder(self):
        source = content("Scripts/Runtime/CrushXSmartCarousel.cs")
        self.assertIn("public bool SetCustomCollection(string folderId)", source)
        self.assertIn("engine.CollectionStore.Get(customCollectionId)", source)
        self.assertIn("foreach (string id in folder.lensIds)", source)
        self.assertIn("public bool StepVisible(int amount)", source)
        self.assertIn("public static List<LensManifest> BuildResults", source)
        self.assertIn("LensBrowseFilter.Recent", source)

    def test_authenticated_host_hook_and_epoch_are_wired(self):
        engine = content("Scripts/Runtime/LensEngineBootstrap.cs")
        receiver = content("Scripts/Bridge/UnityLensReceiver.cs")
        sheet = content("Scripts/Runtime/LensCollectionSheet.cs")
        self.assertIn("public LensCustomCollections CollectionStore", engine)
        self.assertIn("CollectionAccountEpoch++", engine)
        self.assertIn("ConfigureLensCollectionAccountScope", engine)
        self.assertIn("public void SetLensAccountScope", receiver)
        self.assertIn("accountEpoch == currentAccountEpoch", sheet)

    def test_existing_touch_controller_and_safe_area_left_intact(self):
        gesture = content("Scripts/Runtime/CrushXCameraSwipe.cs")
        layout = content("Scripts/Runtime/NativeCameraLayout.cs")
        self.assertIn("waitForAllReleased", gesture)
        self.assertIn("ui.BlocksCameraGestures", gesture)
        self.assertIn("nativeUi.HidesCarousel", content("Scripts/Runtime/CrushXSmartCarousel.cs"))
        self.assertIn("Screen.safeArea", layout)
        self.assertIn("public static NativeCameraLayout Current", layout)

    def test_unity_editmode_tests_and_metas_present(self):
        expected = [
            ASSETS / "Scripts/Runtime/LensCustomCollections.cs",
            ASSETS / "Scripts/Runtime/LensCollectionSheet.cs",
            ASSETS / "Tests/EditMode/LatestLensCollectionIntegrationTests.cs",
        ]
        for path in expected:
            self.assertTrue(path.is_file(), str(path))
            self.assertTrue(Path(str(path) + ".meta").is_file(), str(path))
        tests = content("Tests/EditMode/LatestLensCollectionIntegrationTests.cs")
        for phrase in (
            "LatestInstalledCatalogAndSceneLensRemainUntouched",
            "PerLensCreateAndSaveIsSingleOperation",
            "SnapshotAndAccountScopeDoNotLeakOrCrossMutate",
            "SheetBecomesInvalidIfLensOrAuthenticatedScopeChanges",
        ):
            self.assertIn(phrase, tests)

    def test_no_replacement_of_main_camera_app_artifacts(self):
        self.assertTrue((ASSETS / "SCENES/CrushXNativeAR.unity").exists())
        self.assertTrue((ASSETS / "Scripts/Runtime/NativeLensUI.cs").exists())
        self.assertTrue((ASSETS / "Scripts/Capture/NativeMediaCapture.cs").exists())
        self.assertTrue((ASSETS / "Scripts/Runtime/CrushXCameraSwipe.cs").exists())


if __name__ == "__main__":
    unittest.main()
