using System;
using System.Collections.Generic;
using UnityEngine;

namespace CrushX.LensEngine
{
    /// <summary>
    /// Per-lens save sheet for the EXISTING native Step251 IMGUI camera.
    /// It never installs a second camera renderer or replaces capture controls.
    /// An explicit tap is required before writing each collection membership.
    /// </summary>
    public sealed class LensCollectionSheet
    {
        private readonly LensCustomCollections collections;
        private Vector2 scroll;
        private string lensId;
        private string newName = "";
        private string renameName = "";
        private string selectedFolder;
        private string pendingDelete;
        private string notice = "";
        private bool managementMode;
        private int accountEpoch;

        public bool IsOpen { get; private set; }

        public LensCollectionSheet(LensCustomCollections collections)
        {
            this.collections = collections ??
                throw new ArgumentNullException(nameof(collections));
        }

        public bool Open(string currentLensId, int scopeEpoch)
        {
            if (!LensCatalog.Find(currentLensId).HasValue ||
                !collections.IsHealthy) return false;
            lensId = currentLensId;
            accountEpoch = scopeEpoch;
            scroll = Vector2.zero;
            newName = "";
            renameName = "";
            selectedFolder = null;
            pendingDelete = null;
            managementMode = false;
            notice = "";
            IsOpen = true;
            return true;
        }

        public void Close()
        {
            IsOpen = false;
            lensId = null;
            selectedFolder = null;
            pendingDelete = null;
            newName = "";
            renameName = "";
            notice = "";
            managementMode = false;
        }

        public bool Matches(string currentLensId, int currentAccountEpoch)
        {
            return IsOpen && accountEpoch == currentAccountEpoch &&
                string.Equals(lensId, currentLensId, StringComparison.Ordinal) &&
                LensCatalog.Find(lensId).HasValue && collections.IsHealthy;
        }

        private void ToggleMembership(string folderId)
        {
            bool saved = collections.ContainsLens(folderId, lensId);
            bool ok = saved ? collections.RemoveLens(folderId, lensId) :
                collections.AddLens(folderId, lensId);
            notice = ok ? (saved ? "Removed from folder (lens kept)" : "Saved to collection") :
                "Unable to update. Folder may be full or unavailable.";
        }

        private void CreateWithCurrent()
        {
            string id;
            if (!collections.TryCreateWithLens(newName, lensId, out id))
            {
                notice = "Choose a unique name (up to 32 characters); max 20 folders.";
                return;
            }
            newName = "";
            selectedFolder = id;
            pendingDelete = null;
            notice = "Collection created and lens saved.";
        }

        // All rectangles use NativeCameraLayout's scaled, notch-safe IMGUI coordinates.
        // Draw only while the native UI blocks camera and carousel swipe owners.
        public void Draw(NativeCameraLayout layout, string currentLensId,
            int scopeEpoch, GUIStyle header, GUIStyle status,
            GUIStyle button, GUIStyle input, Action<string> openFolder)
        {
            if (!Matches(currentLensId, scopeEpoch)) { Close(); return; }
            var lens = LensCatalog.Find(lensId);
            float panelHeight = Mathf.Min(layout.Height - 12f, 630f);
            float left = Mathf.Max(10f, (layout.Width - 580f) * .5f);
            float width = layout.Width - left * 2;
            float top = layout.Height - panelHeight;
            GUI.Box(layout.Bounds, GUIContent.none);
            GUI.Box(new Rect(left, top, width, panelHeight), GUIContent.none);
            float x = left + 12f;
            float innerWidth = width - 24f;
            GUI.Label(new Rect(x, top + 8, innerWidth - 94, 40),
                managementMode ? "Manage my collections" : "Save " +
                (lens.HasValue ? lens.Value.DisplayName : "lens"), header);
            if (GUI.Button(new Rect(left + width - 91, top + 7, 79, 44), "Close", button))
            { Close(); return; }
            GUI.Label(new Rect(x, top + 52, innerWidth, 28),
                string.IsNullOrEmpty(notice) ?
                "Private folders on this device · each tap saves/removes" :
                notice, status);
            if (GUI.Button(new Rect(x, top + 82, innerWidth, 42),
                managementMode ? "← Save lens" : "Manage folders", button))
            {
                managementMode = !managementMode;
                pendingDelete = null;
            }

            float listTop = top + 132;
            float formArea = managementMode ? 150 : 132;
            float listHeight = Mathf.Max(85, panelHeight - formArea - 144);
            var folders = collections.All();
            var listRect = new Rect(x, listTop, innerWidth, listHeight);
            float total = 7 + folders.Count * 54;
            scroll = GUI.BeginScrollView(listRect, scroll,
                new Rect(0, 0, Mathf.Max(1, innerWidth - 19), Mathf.Max(listHeight, total)));
            if (folders.Count == 0)
                GUI.Label(new Rect(6, 9, innerWidth - 22, 55),
                    "No collections yet. Create one below.", status);
            for (int i = 0; i < folders.Count; i++)
            {
                LensUserCollection folder = folders[i];
                float y = 7 + i * 54;
                bool saved = collections.ContainsLens(folder.id, lensId);
                if (managementMode)
                {
                    float actionWidth = 42;
                    var labelWidth = Mathf.Max(70, innerWidth - 192);
                    if (GUI.Button(new Rect(0, y, labelWidth, 46),
                        (selectedFolder == folder.id ? "• " : "") + folder.name,
                        button))
                    {
                        selectedFolder = folder.id;
                        renameName = folder.name;
                        pendingDelete = null;
                    }
                    if (GUI.Button(new Rect(labelWidth + 4, y, actionWidth, 46), "↑", button))
                        collections.MoveCollection(folder.id, -1);
                    if (GUI.Button(new Rect(labelWidth + 50, y, actionWidth, 46), "↓", button))
                        collections.MoveCollection(folder.id, 1);
                    if (GUI.Button(new Rect(labelWidth + 96, y, 65, 46), "Open", button))
                    {
                        if (openFolder != null)
                        {
                            openFolder(folder.id);
                            Close();
                            GUI.EndScrollView();
                            return;
                        }
                    }
                }
                else
                {
                    float nameWidth = Mathf.Max(80, innerWidth - 112);
                    GUI.Label(new Rect(5, y, nameWidth, 46),
                        folder.name + " (" + folder.lensIds.Count + ")", status);
                    bool full = folder.lensIds.Count >=
                        LensCustomCollections.MaximumLenses && !saved;
                    bool oldEnabled = GUI.enabled;
                    GUI.enabled = oldEnabled && !full;
                    if (GUI.Button(new Rect(nameWidth, y, 95, 46),
                        saved ? "✓ Saved" : full ? "Full" : "+ Add", button))
                        ToggleMembership(folder.id);
                    GUI.enabled = oldEnabled;
                }
            }
            GUI.EndScrollView();

            float yForm = listTop + listHeight + 8;
            if (managementMode)
            {
                var selected = collections.Get(selectedFolder);
                GUI.Label(new Rect(x, yForm, innerWidth, 25),
                    selected == null ? "Choose a folder to rename/delete" :
                    "Selected: " + selected.name, status);
                renameName = GUI.TextField(
                    new Rect(x, yForm + 27, innerWidth - 100, 42),
                    renameName ?? "", LensCustomCollections.MaximumNameLength, input);
                bool old = GUI.enabled;
                GUI.enabled = old && selected != null;
                if (GUI.Button(new Rect(x + innerWidth - 95, yForm + 27, 95, 42),
                    "Rename", button))
                {
                    if (collections.Rename(selectedFolder, renameName))
                        notice = "Folder renamed.";
                    else notice = "Use a unique, safe name.";
                }
                if (selected != null && GUI.Button(
                    new Rect(x, yForm + 73, innerWidth, 45),
                    pendingDelete == selectedFolder ?
                    "Confirm delete folder (lenses are preserved)" :
                    "Delete selected folder", button))
                {
                    if (pendingDelete != selectedFolder)
                    {
                        pendingDelete = selectedFolder;
                        notice = "Tap Confirm delete to remove this folder.";
                    }
                    else if (collections.Delete(selectedFolder))
                    {
                        selectedFolder = null;
                        pendingDelete = null;
                        notice = "Folder deleted; lens catalog unchanged.";
                    }
                }
                GUI.enabled = old;
            }
            else
            {
                GUI.Label(new Rect(x, yForm, innerWidth, 27),
                    "Create a new collection and add this lens", status);
                newName = GUI.TextField(
                    new Rect(x, yForm + 29, innerWidth - 121, 45),
                    newName ?? "", LensCustomCollections.MaximumNameLength, input);
                if (GUI.Button(new Rect(x + innerWidth - 116, yForm + 29, 116, 45),
                    "Create + Add", button))
                    CreateWithCurrent();
            }
        }
    }
}
