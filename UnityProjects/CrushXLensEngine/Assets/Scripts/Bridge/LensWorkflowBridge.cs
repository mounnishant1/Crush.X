using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace CrushX.LensEngine
{
    public enum LensDraftDestination { Story, Reel, Snap, Chat, Feed }

    [Serializable]
    public sealed class LensContentDraft
    {
        public string DraftId, CaptureId, LensId, MediaPath, MimeType, Destination, CreatedUtc;
        public int Width, Height;
        public double DurationSeconds;
        public bool HasAudio;
    }

    // The native host supplies an adapter for its existing composers. No upload or send API belongs here.
    public interface ILensComposerHost
    {
        bool CanOpen(LensDraftDestination destination);
        bool TryOpenDraft(LensContentDraft draft, out string error);
    }

    [Serializable]
    public sealed class LensCommand
    {
        public string requestId, action, lensId, query, destination;
    }

    [Serializable]
    public sealed class LensCommandReply
    {
        public string requestId, message;
        public bool succeeded;
        public LensCommandMatch[] matches = Array.Empty<LensCommandMatch>();
        public LensContentDraft draft;
    }

    [Serializable]
    public sealed class LensCommandMatch
    {
        public string id, displayName, category, implementation, verification, reason;
        public bool compatible, capabilitiesPending;
    }

    /// <summary>
    /// Local catalog and explicit composer-draft commands for an AURA-X/native host adapter.
    /// No model, biometric analysis, trend source, remote service or publishing is implied.
    /// </summary>
    public sealed class LensWorkflowBridge : MonoBehaviour
    {
        public static ILensComposerHost ComposerHost { get; set; }
        public event Action<LensCommandReply> Replied;
        public event Action<LensContentDraft> DraftPrepared;
        public MediaCaptureResult LastSavedMedia { get; private set; }
        private LensEngineBootstrap engine;
        private NativeMediaCapture capture;

        private void Start()
        {
            engine = GetComponent<LensEngineBootstrap>();
            capture = NativeMediaCapture.GetOrCreate(engine);
            if (capture != null) capture.MediaSaved += OnMediaSaved;
        }

        private void OnMediaSaved(MediaCaptureResult media) { LastSavedMedia = media; }
        private void OnDestroy() { if (capture != null) capture.MediaSaved -= OnMediaSaved; }

        public void HandleCommand(string json)
        {
            var reply = new LensCommandReply();
            try
            {
                if (string.IsNullOrWhiteSpace(json) || json.Length > 4096) throw new ArgumentException("Invalid lens command size");
                LensCommand command = JsonUtility.FromJson<LensCommand>(json);
                if (command == null) throw new ArgumentException("Invalid lens command");
                reply.requestId = command.requestId;
                if (engine == null) engine = GetComponent<LensEngineBootstrap>();
                if (engine == null) throw new InvalidOperationException("Camera engine is not ready");
                switch (command.action)
                {
                    case "search":
                    case "recommend":
                        reply.matches = Search(command.query);
                        reply.succeeded = reply.matches.Length > 0;
                        reply.message = reply.succeeded ? "Local catalog results; verification level is supplied for each lens" : "No matching compatible lens is implemented";
                        break;
                    case "mostUsed":
                        reply.succeeded = engine.PersonalizationEnabled;
                        reply.matches = reply.succeeded ? Search(string.Empty, true) : Array.Empty<LensCommandMatch>();
                        reply.message = reply.succeeded ? (reply.matches.Length > 0 ? "Your consented local usage ranking" : "No lens usage has been saved yet") : "Enable Remember recent lenses on this device first";
                        break;
                    case "select":
                        reply.succeeded = engine.SelectLens(command.lensId);
                        reply.message = reply.succeeded ? "Lens selected; live tracking/rendering status is reported separately" : engine.LastLensError;
                        break;
                    case "prepareDraft":
                        if (!Enum.TryParse(command.destination, true, out LensDraftDestination target) || !Enum.IsDefined(typeof(LensDraftDestination), target))
                            throw new ArgumentException("Unknown composer destination");
                        reply.succeeded = TryPrepareDraft(target, out LensContentDraft draft, out string error);
                        reply.draft = draft; reply.message = error;
                        break;
                    default: reply.message = "Unsupported command; use search, recommend, select or prepareDraft"; break;
                }
            }
            catch (Exception error) { reply.succeeded = false; reply.message = error.Message; }
            Replied?.Invoke(reply);
        }

        public void HandleNaturalLanguage(string text)
        {
            if (LensNaturalLanguage.TryParse(text, out LensCommand command, out string error)) HandleCommand(JsonUtility.ToJson(command));
            else Replied?.Invoke(new LensCommandReply { succeeded = false, message = error });
        }

        public LensCommandMatch[] Search(string query, bool usageOrder = false)
        {
            var matches = new List<LensCommandMatch>();
            if (engine == null) return matches.ToArray();
            query = (query ?? string.Empty).Trim();
            if (query.Length > 160 || query.IndexOf("trending", StringComparison.OrdinalIgnoreCase) >= 0) return matches.ToArray();
            var preferences = new LensPersonalization();
            IReadOnlyList<LensManifest> order = usageOrder ? preferences.Ranked() : engine.RankedLenses;
            foreach (LensManifest lens in order)
            {
                if (usageOrder && preferences.UsageCount(lens.Id) == 0) continue;
                if (!Matches(lens, query)) continue;
                LensCompatibilityResult compatibility = engine.Compatibility(lens);
                if (!compatibility.CanSelect) continue;
                matches.Add(new LensCommandMatch
                {
                    id = lens.Id, displayName = lens.DisplayName, category = lens.Category.ToString(),
                    implementation = lens.Implementation.ToString(), verification = lens.Verification.ToString(),
                    compatible = compatibility.CanSelect, capabilitiesPending = compatibility.PendingCapabilities,
                    reason = engine.IsFavorite(lens.Id) ? "Your local favorite; " + compatibility.Message : compatibility.Message
                });
            }
            return matches.ToArray();
        }

        private static bool Matches(LensManifest lens, string query)
        {
            if (query.Length == 0) return true;
            return lens.Id.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
                lens.DisplayName.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 ||
                lens.Category.ToString().IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public bool TryPrepareDraft(LensDraftDestination destination, out LensContentDraft draft, out string error)
        {
            draft = null;
            string savedRoot = Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "saved");
            if (!ValidateSavedMedia(LastSavedMedia, savedRoot, out error)) return false;
            draft = new LensContentDraft
            {
                DraftId = Guid.NewGuid().ToString("N"), CaptureId = LastSavedMedia.CaptureId,
                LensId = LastSavedMedia.LensId, MediaPath = LastSavedMedia.Path, MimeType = LastSavedMedia.MimeType,
                Destination = destination.ToString(), CreatedUtc = DateTime.UtcNow.ToString("O"),
                Width = LastSavedMedia.Width, Height = LastSavedMedia.Height,
                DurationSeconds = LastSavedMedia.DurationSeconds, HasAudio = LastSavedMedia.HasAudio
            };
            try
            {
                string directory = Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "composer-drafts");
                Directory.CreateDirectory(directory);
                File.WriteAllText(Path.Combine(directory, draft.DraftId + ".json"), JsonUtility.ToJson(draft, true));
                DraftPrepared?.Invoke(draft);
                // This creates an editable local draft only. Opening an app composer is a separate explicit operation.
                error = "Editable local draft prepared; host composer connection is required to open it";
                return true;
            }
            catch (Exception exception) { error = "Unable to prepare local draft: " + exception.Message; draft = null; return false; }
        }

        public bool TryOpenComposer(LensContentDraft draft, out string error)
        {
            error = "No Crush.X host composer is connected";
            if (draft == null || !Enum.TryParse(draft.Destination, out LensDraftDestination destination) || ComposerHost == null || !ComposerHost.CanOpen(destination)) return false;
            string savedRoot = Path.Combine(Application.persistentDataPath, "CrushXLensCaptures", "saved");
            if (!CaptureFileValidation.IsControlledPath(draft.MediaPath, savedRoot) || !File.Exists(draft.MediaPath))
            { error = "Draft media is unavailable"; return false; }
            try { return ComposerHost.TryOpenDraft(draft, out error); }
            catch (Exception exception) { error = "Host composer failed: " + exception.Message; return false; }
        }

        public static bool ValidateSavedMedia(MediaCaptureResult media, string savedRoot, out string error)
        {
            error = "Save a completed photo or video first";
            try
            {
                if (media == null || !CaptureFileValidation.IsControlledPath(media.Path, savedRoot) || !File.Exists(media.Path)) return false;
                if (media.Width < 1 || media.Height < 1 || new FileInfo(media.Path).Length <= 0) return false;
                if (media.MimeType != "image/png" && media.MimeType != "video/mp4") return false;
                error = string.Empty; return true;
            }
            catch (Exception exception) { error = "Saved media validation failed: " + exception.Message; return false; }
        }
    }
}
