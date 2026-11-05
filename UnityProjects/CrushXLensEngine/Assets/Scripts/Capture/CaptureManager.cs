namespace CrushX.LensEngine
{
    /// <summary>Compatibility entry point. Completion is asynchronous; observe NativeMediaCapture events.</summary>
    public static class CaptureManager
    {
        public static NativeMediaCapture GetOrCreate(LensEngineBootstrap engine) => NativeMediaCapture.GetOrCreate(engine);

        // A pending filename is not a saved capture. Existing callers receive null until migrated
        // to PreviewReady/MediaSaved; no host is told to upload an unfinished screenshot.
        public static string SavePhoto(LensEngineBootstrap engine)
        {
            if (engine != null) GetOrCreate(engine).RequestPhoto();
            return null;
        }
    }
}
