using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace CrushX.LensEngine.AssetLoading
{
    public enum ModelFileFormat { TensorFlowLite, MediaPipeTask, Onnx }
    public enum ModelPurpose { FaceBlendshapes, PersonSegmentation, SkinSegmentation, HairSegmentation, HandLandmarks, BodyPose, Depth }
    public enum ModelInputLayout { Hwc, Chw }
    public enum ModelInputType { Float32, UInt8 }

    /// <summary>Untrusted file metadata. It cannot grant itself licence or execution approval.</summary>
    [Serializable]
    public sealed class LocalModelManifest
    {
        public int SchemaVersion = 1;
        public string Id, Version, RelativePath, Sha256;
        public long FileBytes;
        public ModelFileFormat Format;
        public ModelPurpose Purpose;
        public string RuntimeId, RuntimeVersion, InputContract, OutputContract, LicenseId;
        public int InputWidth, InputHeight, InputChannels;
        public ModelInputLayout InputLayout;
        public ModelInputType InputType;
        public LocalModelManifest Copy() => (LocalModelManifest)MemberwiseClone();
    }

    /// <summary>Created by the host's separately reviewed registry, never decoded from a model manifest.</summary>
    public sealed class ModelApproval
    {
        public readonly string Id, Version, Sha256, LicenseId, ReviewReceipt;
        public readonly long FileBytes;
        public readonly ModelPurpose Purpose;
        public ModelApproval(string id, string version, string sha256, long fileBytes,
            ModelPurpose purpose, string licenseId, string reviewReceipt)
        {
            Id = id; Version = version; Sha256 = sha256; FileBytes = fileBytes;
            Purpose = purpose; LicenseId = licenseId; ReviewReceipt = reviewReceipt;
        }
    }

    public interface IModelApprovalRegistry
    {
        bool TryGet(string id, string version, out ModelApproval approval);
    }

    public sealed class FixedModelApprovalRegistry : IModelApprovalRegistry
    {
        private readonly Dictionary<string, ModelApproval> approvals = new Dictionary<string, ModelApproval>(StringComparer.Ordinal);
        public FixedModelApprovalRegistry(IEnumerable<ModelApproval> reviewedApprovals)
        {
            if (reviewedApprovals == null) throw new ArgumentNullException(nameof(reviewedApprovals));
            foreach (ModelApproval item in reviewedApprovals)
            {
                if (item == null || !ArtifactPolicy.ValidToken(item.Id) || !ArtifactPolicy.ValidToken(item.Version)
                    || !ArtifactPolicy.IsSha256(item.Sha256) || item.FileBytes < 8 || item.FileBytes > ArtifactPolicy.MaximumModelBytes
                    || !ArtifactPolicy.ValidText(item.LicenseId, 120) || !ArtifactPolicy.ValidText(item.ReviewReceipt, 500)
                    || !Enum.IsDefined(typeof(ModelPurpose), item.Purpose))
                    throw new ArgumentException("A model approval requires an exact hash, size, purpose and reviewed licence receipt");
                if (approvals.Count >= 128) throw new ArgumentException("Approval registry is too large");
                approvals.Add(Key(item.Id, item.Version), item);
            }
        }
        public bool TryGet(string id, string version, out ModelApproval approval) => approvals.TryGetValue(Key(id, version), out approval);
        private static string Key(string id, string version) => (id ?? "") + "\n" + (version ?? "");
    }

    /// <summary>The installed runner registers its exact parser, tensor and output contracts.</summary>
    public sealed class ModelRuntimeRegistration
    {
        public readonly string RuntimeId, RuntimeVersion, InputContract, OutputContract;
        public readonly ModelFileFormat Format;
        public readonly ModelPurpose Purpose;
        public readonly int InputWidth, InputHeight, InputChannels;
        public readonly ModelInputLayout InputLayout;
        public readonly ModelInputType InputType;
        public ModelRuntimeRegistration(string runtimeId, string runtimeVersion, ModelFileFormat format, ModelPurpose purpose,
            string inputContract, string outputContract, int width, int height, int channels, ModelInputLayout layout, ModelInputType inputType)
        {
            RuntimeId = runtimeId; RuntimeVersion = runtimeVersion; Format = format; Purpose = purpose;
            InputContract = inputContract; OutputContract = outputContract; InputWidth = width; InputHeight = height;
            InputChannels = channels; InputLayout = layout; InputType = inputType;
        }
        public bool Accepts(LocalModelManifest model) => model != null &&
            RuntimeId == model.RuntimeId && RuntimeVersion == model.RuntimeVersion && Format == model.Format && Purpose == model.Purpose &&
            InputContract == model.InputContract && OutputContract == model.OutputContract &&
            InputWidth == model.InputWidth && InputHeight == model.InputHeight && InputChannels == model.InputChannels &&
            InputLayout == model.InputLayout && InputType == model.InputType;
    }

    public static class ArtifactPolicy
    {
        public const long MaximumModelBytes = 128L * 1024 * 1024;
        private static readonly Regex Token = new Regex("\\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}\\z", RegexOptions.CultureInvariant);
        public static bool ValidToken(string text) => text != null && Token.IsMatch(text);
        public static bool IsSha256(string text)
        {
            if (text == null || text.Length != 64) return false;
            foreach (char c in text) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false;
            return true;
        }
        public static bool ValidText(string text, int maximum)
        {
            if (string.IsNullOrWhiteSpace(text) || text.Length > maximum) return false;
            foreach (char c in text) if (char.IsControl(c)) return false;
            return true;
        }
        public static bool Validate(LocalModelManifest model, out string error)
        {
            error = "Invalid model manifest";
            if (model == null || model.SchemaVersion != 1 || !ValidToken(model.Id) || !ValidToken(model.Version)
                || !IsSha256(model.Sha256) || model.FileBytes < 8 || model.FileBytes > MaximumModelBytes
                || !ValidToken(model.RuntimeId) || !ValidToken(model.RuntimeVersion)
                || !ValidToken(model.InputContract) || !ValidToken(model.OutputContract) || !ValidText(model.LicenseId, 120)
                || !Enum.IsDefined(typeof(ModelFileFormat), model.Format) || !Enum.IsDefined(typeof(ModelPurpose), model.Purpose)
                || !Enum.IsDefined(typeof(ModelInputLayout), model.InputLayout) || !Enum.IsDefined(typeof(ModelInputType), model.InputType)
                || model.InputWidth < 1 || model.InputWidth > 4096 || model.InputHeight < 1 || model.InputHeight > 4096
                || (model.InputChannels != 3 && model.InputChannels != 4)) return false;
            if (!ValidRelativePath(model.RelativePath)) { error = "Model path must remain inside its local artifact root"; return false; }
            string extension = model.Format == ModelFileFormat.TensorFlowLite ? ".tflite" : model.Format == ModelFileFormat.MediaPipeTask ? ".task" : ".onnx";
            if (!model.RelativePath.EndsWith(extension, StringComparison.OrdinalIgnoreCase)) { error = "Model file extension does not match its registered format"; return false; }
            error = ""; return true;
        }
        public static bool ValidRelativePath(string path)
        {
            if (string.IsNullOrEmpty(path) || path.Length > 240 || path[0] == '/' || path.IndexOf('\\') >= 0 || path.IndexOf(':') >= 0) return false;
            foreach (string segment in path.Split('/'))
            {
                if (segment.Length == 0 || segment == "." || segment == "..") return false;
                foreach (char c in segment) if (char.IsControl(c)) return false;
            }
            return true;
        }
    }
}
