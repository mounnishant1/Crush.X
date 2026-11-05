using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace CrushX.LensEngine
{
    public sealed partial class LensCameraProductionUI
    {
        private VisualElement customManagerOverlay;
        private ScrollView folderList, folderLensList, searchResults;
        private TextField createFolderField, renameFolderField, searchLensField;
        private Label customStatus, currentFolderLabel;
        private Button deleteFolderButton, addCurrentButton, removeCurrentButton;
        private string selectedFolderId;
        private bool customManagerOpen;
        private string pendingDeleteId;
        private int lastCollectionRevision = -1;

        private void BuildCustomManager(VisualElement tabsRow)
        {
            var foldersButton = MakeButton("Folders", "Manage your own lens collections",
                ToggleCustomManager);
            foldersButton.style.width = 83;
            tabsRow.Add(foldersButton);

            customManagerOverlay = new VisualElement { name = "lens-custom-manager" };
            Fill(customManagerOverlay);
            customManagerOverlay.style.backgroundColor =
                new Color(.02f, .03f, .06f, .95f);
            customManagerOverlay.style.alignItems = Align.Center;
            customManagerOverlay.style.justifyContent = Justify.Center;
            customManagerOverlay.style.display = DisplayStyle.None;
            customManagerOverlay.pickingMode = PickingMode.Position;

            var panel = new ScrollView(ScrollViewMode.Vertical);
            panel.style.width = Length.Percent(94);
            panel.style.maxWidth = 530;
            panel.style.height = Length.Percent(85);
            panel.style.backgroundColor = Dark;
            panel.style.paddingLeft = 12;
            panel.style.paddingRight = 12;
            panel.style.paddingTop = 10;
            panel.style.paddingBottom = 10;
            customManagerOverlay.Add(panel);

            var titleRow = new VisualElement();
            titleRow.style.flexDirection = FlexDirection.Row;
            titleRow.style.alignItems = Align.Center;
            titleRow.Add(MakeLabel("My Lens Collections", 18, White));
            titleRow.Add(MakeButton("Close", "Return to camera", CloseCustomManager));
            panel.Add(titleRow);
            customStatus = MakeLabel(
                "Create up to 20 private collections. No third-party lens imports.",
                12, Muted);
            customStatus.style.whiteSpace = WhiteSpace.Normal;
            panel.Add(customStatus);

            createFolderField = new TextField("New collection");
            createFolderField.maxLength = LensCustomCollections.MaximumNameLength;
            createFolderField.tooltip = "Name up to 32 characters; e.g. Party Lenses";
            panel.Add(createFolderField);
            panel.Add(MakeButton("Create collection", "Create a private local lens folder",
                CreateCollectionFromInput));

            panel.Add(MakeLabel("Your collections (tap to manage)", 15, White));
            folderList = new ScrollView(ScrollViewMode.Vertical);
            folderList.style.maxHeight = 190;
            panel.Add(folderList);

            currentFolderLabel = MakeLabel("Select a folder", 15, White);
            panel.Add(currentFolderLabel);
            renameFolderField = new TextField("Rename selected");
            renameFolderField.maxLength = LensCustomCollections.MaximumNameLength;
            panel.Add(renameFolderField);

            var actions = new VisualElement();
            actions.style.flexDirection = FlexDirection.Row;
            actions.style.flexWrap = Wrap.Wrap;
            panel.Add(actions);
            actions.Add(MakeButton("Rename", "Rename selected collection", () =>
            {
                if (Engine != null &&
                    Engine.RenameCustomCollection(selectedFolderId,
                        renameFolderField.value))
                {
                    Announce("Collection renamed.");
                    AfterCollectionChange();
                }
                else Announce("Choose a unique name up to 32 characters.");
            }));
            actions.Add(MakeButton("Open", "Open selected collection in camera",
                () =>
                {
                    string selected = selectedFolderId;
                    if (Engine != null && Engine.SetCollection(selected))
                    {
                        CloseCustomManager();
                        RefreshVisualState(true);
                    }
                }));
            deleteFolderButton = MakeButton("Delete", "Delete selected collection only",
                DeleteWithConfirmation);
            actions.Add(deleteFolderButton);

            var currentActions = new VisualElement();
            currentActions.style.flexDirection = FlexDirection.Row;
            currentActions.style.flexWrap = Wrap.Wrap;
            panel.Add(currentActions);
            addCurrentButton = MakeButton("Add current lens",
                "Add the currently selected lens to this collection",
                () =>
                {
                    if (Engine != null &&
                        Engine.AddLensToCustomCollection(selectedFolderId, Engine.ActiveId))
                    {
                        Announce("Lens saved to collection.");
                        AfterCollectionChange();
                    }
                    else Announce("Lens already saved or collection is full.");
                });
            currentActions.Add(addCurrentButton);
            removeCurrentButton = MakeButton("Remove current lens",
                "Remove selected lens reference; the lens stays in All",
                () =>
                {
                    if (Engine != null &&
                        Engine.RemoveLensFromCustomCollection(selectedFolderId,
                            Engine.ActiveId))
                    {
                        Announce("Lens removed from collection.");
                        AfterCollectionChange();
                    }
                    else Announce("Lens is not in this collection.");
                });
            currentActions.Add(removeCurrentButton);

            searchLensField = new TextField("Find a lens to add");
            searchLensField.maxLength = 32;
            searchLensField.RegisterValueChangedCallback(evt => RefreshSearchResults());
            panel.Add(searchLensField);
            searchResults = new ScrollView(ScrollViewMode.Vertical);
            searchResults.style.maxHeight = 145;
            panel.Add(searchResults);

            panel.Add(MakeLabel("Saved lenses (↑ ↓ changes their order)",
                14, White));
            folderLensList = new ScrollView(ScrollViewMode.Vertical);
            folderLensList.style.maxHeight = 220;
            panel.Add(folderLensList);

            root.Add(customManagerOverlay);
        }

        private void Announce(string message)
        {
            if (customStatus != null) customStatus.text = message;
        }

        private void ToggleCustomManager()
        {
            if (customManagerOverlay == null) return;
            customManagerOpen = !customManagerOpen;
            bool show = customManagerOpen;
            customManagerOverlay.style.display = show ?
                DisplayStyle.Flex : DisplayStyle.None;
            if (show)
            {
                // Discard any unfinished swipe; this panel owns all gestures.
                if (pointerId != -1 && previewArea != null &&
                    previewArea.HasPointerCapture(pointerId))
                    previewArea.ReleasePointer(pointerId);
                pointerId = -1;
                multiTouchCancelled = true;
                browseOpen = false;
                browsePanel.style.display = DisplayStyle.None;
                browseButton.text = "Browse";
                pendingDeleteId = null;
                RefreshCustomManager();
            }
        }

        private void CloseCustomManager()
        {
            customManagerOpen = false;
            if (customManagerOverlay != null)
                customManagerOverlay.style.display = DisplayStyle.None;
            pendingDeleteId = null;
        }

        private void CreateCollectionFromInput()
        {
            if (Engine == null) return;
            string id;
            if (!Engine.CreateCustomCollection(createFolderField.value, out id))
            {
                Announce("Invalid/duplicate name, maximum 20 folders, or storage unavailable.");
                return;
            }
            createFolderField.value = "";
            selectedFolderId = id;
            pendingDeleteId = null;
            Announce("Collection created. Add current or search for a lens.");
            AfterCollectionChange();
        }

        private void DeleteWithConfirmation()
        {
            if (Engine == null || !Engine.IsCustomCollection(selectedFolderId))
                return;
            if (pendingDeleteId != selectedFolderId)
            {
                pendingDeleteId = selectedFolderId;
                deleteFolderButton.text = "Confirm delete";
                Announce("Tap Confirm delete again to remove this folder, not its lenses.");
                return;
            }
            if (!Engine.DeleteCustomCollection(selectedFolderId))
            {
                Announce("Unable to delete collection.");
                return;
            }
            pendingDeleteId = null;
            selectedFolderId = null;
            Announce("Folder deleted. The original lenses are unchanged.");
            AfterCollectionChange();
        }

        private void AfterCollectionChange()
        {
            lastCollectionRevision = -1;
            RebuildCollectionButtons();
            RefreshCustomManager();
            RefreshVisualState(true);
        }

        private void RebuildCollectionButtons()
        {
            if (Engine == null || categoryStrip == null || browseList == null)
                return;
            Vector2 previousOffset = categoryStrip.scrollOffset;
            categories.Clear();
            categoryStrip.Clear();
            browseList.Clear();
            foreach (string key in Engine.CollectionKeys())
            {
                string capturedKey = key;
                string label = Engine.CollectionLabel(key);
                if (string.IsNullOrEmpty(label)) continue;
                var chip = MakeButton(label, "Open collection " + label,
                    () => OpenCollection(capturedKey));
                chip.style.marginRight = 5;
                chip.style.minWidth = 92;
                categoryStrip.Add(chip);
                categories.Add(key, chip);
                var choice = MakeButton(label, "Choose " + label,
                    () => OpenCollection(capturedKey));
                choice.style.marginBottom = 4;
                browseList.Add(choice);
            }
            categoryStrip.scrollOffset = previousOffset;
            lastCollectionRevision = Engine.CollectionRevision;
        }

        private void RefreshCustomManager()
        {
            if (Engine == null || folderList == null) return;
            var folders = Engine.UserCollections;
            if (!Engine.IsCustomCollection(selectedFolderId))
                selectedFolderId = folders.Count > 0 ? folders[0].id : null;

            folderList.Clear();
            for (int i = 0; i < folders.Count; i++)
            {
                LensUserCollection folder = folders[i];
                string id = folder.id;
                var row = new VisualElement();
                row.style.flexDirection = FlexDirection.Row;
                row.style.minHeight = 44;
                var choose = MakeButton(folder.name + " (" + folder.lensIds.Count + ")",
                    "Select private folder", () =>
                    {
                        selectedFolderId = id;
                        pendingDeleteId = null;
                        RefreshCustomManager();
                    });
                choose.style.flexGrow = 1;
                choose.style.backgroundColor = selectedFolderId == id ?
                    Selected : Neutral;
                row.Add(choose);
                row.Add(MakeButton("↑", "Move folder earlier", () =>
                {
                    if (Engine.ReorderCustomCollection(id, -1))
                        AfterCollectionChange();
                }));
                row.Add(MakeButton("↓", "Move folder later", () =>
                {
                    if (Engine.ReorderCustomCollection(id, 1))
                        AfterCollectionChange();
                }));
                folderList.Add(row);
            }

            var selected = FindSelectedFolder(folders);
            bool hasFolder = selected != null;
            renameFolderField.SetValueWithoutNotify(hasFolder ? selected.name : "");
            renameFolderField.SetEnabled(hasFolder);
            deleteFolderButton.SetEnabled(hasFolder);
            deleteFolderButton.text = pendingDeleteId == selectedFolderId &&
                hasFolder ? "Confirm delete" : "Delete";
            addCurrentButton.SetEnabled(hasFolder && Engine.ActiveId != null);
            removeCurrentButton.SetEnabled(hasFolder && Engine.ActiveId != null);
            currentFolderLabel.text = hasFolder ?
                selected.name + " · " + selected.lensIds.Count + " saved lenses" :
                "No collection selected. Create one above.";

            folderLensList.Clear();
            if (selected != null)
            {
                foreach (string lensId in selected.lensIds)
                {
                    string capturedId = lensId;
                    LensManifest? known = LensCatalog.Find(lensId);
                    var row = new VisualElement();
                    row.style.flexDirection = FlexDirection.Row;
                    var title = MakeLabel(
                        known.HasValue ? known.Value.DisplayName : "Unavailable lens",
                        12, White);
                    title.style.flexGrow = 1;
                    row.Add(title);
                    row.Add(MakeButton("↑", "Move lens up", () =>
                    {
                        if (Engine.ReorderLensInCustomCollection(
                            selectedFolderId, capturedId, -1)) AfterCollectionChange();
                    }));
                    row.Add(MakeButton("↓", "Move lens down", () =>
                    {
                        if (Engine.ReorderLensInCustomCollection(
                            selectedFolderId, capturedId, 1)) AfterCollectionChange();
                    }));
                    row.Add(MakeButton("×", "Remove lens from folder", () =>
                    {
                        if (Engine.RemoveLensFromCustomCollection(
                            selectedFolderId, capturedId)) AfterCollectionChange();
                    }));
                    folderLensList.Add(row);
                }
            }
            RefreshSearchResults();
        }

        private LensUserCollection FindSelectedFolder(
            IReadOnlyList<LensUserCollection> folders)
        {
            foreach (var folder in folders)
                if (folder.id == selectedFolderId) return folder;
            return null;
        }

        private void RefreshSearchResults()
        {
            if (searchResults == null || Engine == null) return;
            searchResults.Clear();
            if (!Engine.IsCustomCollection(selectedFolderId))
                return;
            var selected = Engine.UserCollections;
            var folder = FindSelectedFolder(selected);
            if (folder == null) return;
            string query = (searchLensField.value ?? "").Trim();
            int shown = 0;
            foreach (LensManifest lens in LensCatalog.All)
            {
                if (!string.IsNullOrEmpty(query) &&
                    lens.DisplayName.IndexOf(query,
                        StringComparison.OrdinalIgnoreCase) < 0 &&
                    lens.Id.IndexOf(query,
                        StringComparison.OrdinalIgnoreCase) < 0) continue;
                if (folder.lensIds.Contains(lens.Id)) continue;
                string capturedId = lens.Id;
                searchResults.Add(MakeButton("+ " + lens.DisplayName,
                    "Add existing original lens to selected folder", () =>
                    {
                        if (Engine.AddLensToCustomCollection(
                            selectedFolderId, capturedId))
                        {
                            Announce("Added " + lens.DisplayName);
                            AfterCollectionChange();
                        }
                    }));
                if (++shown >= 8) break;
            }
            if (shown == 0)
                searchResults.Add(MakeLabel(
                    "No available matching lens", 12, Muted));
        }
    }
}
