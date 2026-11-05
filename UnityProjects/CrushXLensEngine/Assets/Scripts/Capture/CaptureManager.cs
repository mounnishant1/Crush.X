using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace CrushX.LensEngine
{
    public sealed class LensCaptureReceipt
    {
        public string Path;
        public string LensId;
        public bool Success;
        public string Error;
    }

    public static class CaptureManager
    {
        // A photo should work with NO face too (normal camera/off-mode).
        // CaptureScreenshot saves an image asynchronously; returning a path is
        // NOT proof that the image was successfully encoded on disk.
        public static string SavePhoto(LensEngineBootstrap engine)
        {
            if (engine == null || !engine.isActiveAndEnabled)
                return null;

            try
            {
                string folder = Path.Combine(Application.persistentDataPath,
                    "CrushXLensCaptures");
                Directory.CreateDirectory(folder);
                string name = "lens_" +
                    DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff") + "_" +
                    Guid.NewGuid().ToString("N").Substring(0, 8) + ".png";
                string path = Path.Combine(folder, name);
                engine.StartCoroutine(WriteAndVerify(engine, path, engine.ActiveId));
                engine.Say("Saving photo...");
                return path; // Pending receipt; not proof of successful capture.
            }
            catch (Exception error)
            {
                Debug.LogWarning("[Crush.X Camera] Failed to request photo: " +
                    error.GetType().Name);
                engine.Say("Unable to save photo");
                return null;
            }
        }

        public static event Action<LensCaptureReceipt> OnPhotoReceipt;

        private static IEnumerator WriteAndVerify(LensEngineBootstrap engine,
            string path, string lensId)
        {
            // Wait for the final rendered frame, including original GPU effects.
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(path);
            float deadline = Time.realtimeSinceStartup + 6f;
            bool wrote = false;
            while (Time.realtimeSinceStartup < deadline)
            {
                try
                {
                    if (File.Exists(path) && new FileInfo(path).Length >= 32)
                    {
                        wrote = true;
                        break;
                    }
                }
                catch (IOException) { }
                yield return null;
            }

            LensCaptureReceipt receipt = new LensCaptureReceipt
            {
                Path = path,
                LensId = lensId,
                Success = wrote,
                Error = wrote ? null : "Image was not written before timeout"
            };
            if (engine != null)
                engine.Say(wrote ? "Photo saved" : "Photo save failed");
            OnPhotoReceipt?.Invoke(receipt);
        }
    }
}
