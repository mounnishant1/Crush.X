using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace CrushX.LensEngine
{
    // One-tap per-lens quick-save. This is a modal within the existing
    // dedicated camera UIDocument, not another overlaying UI panel.
    public sealed partial class LensCameraProductionUI
    {
        private VisualElement quickSaveOverlay, quickSaveSheet;
        private ScrollView quickSaveFolders;
        private Label quickSaveTitle, quickSaveStatus, quickSaveHint;
        private TextField quickCreateInput;
        private Button quickSaveOpenButton;
        private bool quickSaveOpen;
        private string quickSaveLensId;
        private int quickSaveAccountRevision;
        private int quickSaveCollectionRevision = -1;

        private void BuildQuickSaveSheet()
        {
            quickSaveOverlay = new VisualElement
            {
                name = "lens-add-to-collection-modal"
            };
            Fill(quickSaveOverlay);
            quickSaveOverlay.pickingMode = PickingMode.Position;
            quickSaveOverlay.style.display = DisplayStyle.None;
            quickSaveOverlay.style.backgroundColor =
                new Color(.015f, .02f, .035f, .91f);
            quickSaveOverlay.style.alignItems = Align.Center;
            quickSaveOverlay.style.justifyContent = Justify.FlexEnd;

            quickSaveSheet = new VisualElement
            {
                name = "lens-add-to-collection-sheet"
            };
            quickSaveSheet.style.width = Length.Percent(100);
            quickSaveSheet.style.maxWidth = 560;
            quickSaveSheet.style.maxHeight = Length.Percent(76);
            quickSaveSheet.style.backgroundColor = Dark;
            quickSaveSheet.style.paddingLeft = 16;
            quickSaveSheet.style.paddingRight = 16;
            quickSaveSheet.style.paddingTop = 12;
            quickSaveSheet.style.paddingBottom = 12;
            quickSaveSheet.style.borderTopLeftRadius = 20;
            quickSaveSheet.style.borderTopRightRadius = 20;
            quickSaveOverlay.Add(quickSaveSheet);

            var titleRow = new VisualElement();
            titleRow.style.flexDirection = FlexDirection.Row;
            titleRow.style.alignItems = Align.Center;
            quickSaveSheet.Add(titleRow);
            quickSaveTitle = MakeLabel("Save lens to collection", 18, White);
            quickSaveTitle.style.flexGrow = 1;
            titleRow.Add(quickSaveTitle);
            titleRow.Add(MakeButton("Close", "Close save to collection",
                CloseQuickSave));

            quickSaveStatus = MakeLabel("", 13, Muted);
            quickSaveStatus.style.whiteSpace = WhiteSpace.Normal;
            quickSaveStatus.style.marginTop = 5;
            quickSaveStatus.style.marginBottom = 6;
            quickSaveSheet.Add(quickSaveStatus);

            quickSaveHint = MakeLabel("", 13, Muted);
            quickSaveHint.style.whiteSpace = WhiteSpace.Normal;
            quickSaveSheet.Add(quickSaveHint);

            quickSaveFolders = new ScrollView(ScrollViewMode.Vertical)
            {
                name = "lens-add-to-collection-options"
            };
            quickSaveFolders.style.maxHeight = 270;
            quickSaveFolders.style.minHeight = 70;
            quickSaveFolders.verticalScrollerVisibility = ScrollerVisibility.Auto;
            quickSaveSheet.Add(quickSaveFolders);

            var createTitle = MakeLabel("Or create a new collection", 14, White);
            createTitle.style.marginTop = 12;
            quickSaveSheet.Add(createTitle);
            quickCreateInput = new TextField("Collection name");
            quickCreateInput.maxLength = LensCustomCollections.MaximumNameLength;
            quickCreateInput.tooltip = "Private collection name, up to 32 characters";
            quickSaveSheet.Add(quickCreateInput);
            var createButton = MakeButton("Create & add this lens",
                "Create a new private collection with the current lens",
                CreateCollectionForCurrentLens);
            createButton.style.minHeight = 48;
            quickSaveSheet.Add(createButton);
            root.Add(quickSaveOverlay);
        }

        private void OpenQuickSave()
        {
            if (Engine == null || quickSaveOverlay == null ||
                !LensCatalog.Find(Engine.ActiveId).HasValue) return;

            // Stop an unfinished preview gesture. A collection tap is never
            // interpreted as a camera swipe or a photo capture.
            if (pointerId != -1 && previewArea != null &&
                previewArea.HasPointerCapture(pointerId))
                previewArea.ReleasePointer(pointerId);
            pointerId = -1;
            multiTouchCancelled = true;

            // Only one camera modal open at a time.
            if (customManagerOpen) CloseCustomManager();
            browseOpen = false;
            if (browsePanel != null)
                browsePanel.style.display = DisplayStyle.None;
            if (browseButton != null) browseButton.text = "Browse";

            quickSaveLensId = Engine.ActiveId;
            quickSaveAccountRevision = Engine.AccountScopeRevision;
            quickSaveCollectionRevision = -1;
            quickSaveOpen = true;
            quickSaveOverlay.style.display = DisplayStyle.Flex;
            if (quickCreateInput != null)
                quickCreateInput.SetValueWithoutNotify("");
            quickSaveStatus.text = "Choose any collection below to save this lens.";
            RefreshQuickSaveOptions();
        }

        private void CloseQuickSave()
        {
            quickSaveOpen = false;
            quickSaveLensId = null;
            quickSaveCollectionRevision = -1;
            if (quickSaveOverlay != null)
                quickSaveOverlay.style.display = DisplayStyle.None;
        }

        // Reject asynchronous host account/lens changes instead of writing
        // a lens into a different signed-in account's local storage.
        private bool IsQuickSaveTargetCurrent()
        {
            return quickSaveOpen && Engine != null &&
                Engine.AccountScopeRevision == quickSaveAccountRevision &&
                string.Equals(Engine.ActiveId, quickSaveLensId,
                    StringComparison.Ordinal) &&
                LensCatalog.Find(quickSaveLensId).HasValue;
        }

        private void RefreshQuickSaveOptions()
        {
            if (!IsQuickSaveTargetCurrent())
            {
                CloseQuickSave();
                return;
            }
            quickSaveCollectionRevision = Engine.CollectionRevision;
            quickSaveFolders.Clear();
            var folders = Engine.UserCollections;
            var info = LensCatalog.Find(quickSaveLensId);
            quickSaveTitle.text = info.HasValue ?
                "Save " + info.Value.DisplayName : "Save lens to collection";
            if (folders.Count == 0)
            {
                quickSaveHint.text =
                    "No custom collections yet. Create one below to save this lens.";
            }
            else
            {
                quickSaveHint.text = folders.Count +
                    " of " + LensCustomCollections.MaximumCollections +
                    " private collections";
            }
            foreach (var folder in folders)
            {
                string folderId = folder.id;
                bool alreadySaved = Engine.IsLensInCustomCollection(
                    folderId, quickSaveLensId);
                bool full = folder.lensIds.Count >=
                    LensCustomCollections.MaximumLenses;
                string label = folder.name +
                    (alreadySaved ? "   ✓ Saved" : full ? "   Full" : "   + Add");
                var button = MakeButton(label,
                    alreadySaved ? "Remove this lens from " + folder.name :
                    "Add this lens to " + folder.name,
                    () => ToggleQuickSaveFolder(folderId));
                button.style.minHeight = 48;
                button.style.marginBottom = 6;
                button.style.backgroundColor =
                    alreadySaved ? Selected : Neutral;
                button.SetEnabled(alreadySaved || !full);
                quickSaveFolders.Add(button);
            }
        }

        private void ToggleQuickSaveFolder(string folderId)
        {
            if (!IsQuickSaveTargetCurrent()) return;
            bool alreadySaved = Engine.IsLensInCustomCollection(
                folderId, quickSaveLensId);
            // Re-read immediately before mutation: state might have changed
            // since the sheet was drawn.
            bool changed = alreadySaved ?
                Engine.RemoveLensFromCustomCollection(folderId,
                    quickSaveLensId) :
                Engine.AddLensToCustomCollection(folderId,
                    quickSaveLensId);
            if (!changed)
            {
                quickSaveStatus.text =
                    "Could not update collection. Check folder or storage.";
                RefreshQuickSaveOptions();
                return;
            }
            quickSaveStatus.text = alreadySaved ?
                "Removed from collection. Lens remains in All." :
                "Saved to collection.";
            // Removal may select another lens when viewing the same folder.
            if (IsQuickSaveTargetCurrent())
                RefreshQuickSaveOptions();
            else
                CloseQuickSave();
        }

        private void CreateCollectionForCurrentLens()
        {
            if (!IsQuickSaveTargetCurrent()) return;
            string id;
            if (!Engine.CreateCustomCollectionWithLens(
                quickCreateInput.value, quickSaveLensId, out id))
            {
                quickSaveStatus.text =
                    "Use a unique name (1–32 characters); max 20 folders.";
                return;
            }
            quickCreateInput.SetValueWithoutNotify("");
            quickSaveStatus.text = "Collection created and lens saved.";
            RefreshQuickSaveOptions();
        }
    }
}
