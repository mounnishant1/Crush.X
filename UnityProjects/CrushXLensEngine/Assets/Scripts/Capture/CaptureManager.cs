using System;
using System.IO;
using UnityEngine;

namespace CrushX.LensEngine
{
    public static class CaptureManager
    {
        // ScreenCapture is the Unity-rendered frame, including effects. Camera permissions
        // and access to the external gallery need separate Android host integration.
        public static string SavePhoto(LensEngineBootstrap engine)
        {
            if (engine == null || !engine.TrackingActive)
            {
                if (engine != null) engine.Say("No tracked face; photo not captured");
                return null;
            }
            var folder = Path.Combine(Application.persistentDataPath, "CrushXLensCaptures");
            Directory.CreateDirectory(folder);
            string name = "lens_" + DateTime.UtcNow.ToString("yyyyMMdd_HHmmss_fff") + ".png";
            string path = Path.Combine(folder, name);
            ScreenCapture.CaptureScreenshot(path);
            engine.Say("PNG capture requested: " + name);
            return path; // Asynchronous save: file may not exist until the next rendered frame.
        }
    }
}
