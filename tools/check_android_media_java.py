#!/usr/bin/env python3
"""Compile Android Java APIs + run pure conversion cases. Does NOT run Android codecs.

Supply a local Eclipse ECJ compiler jar and an Android API jar (or Robolectric
android-all). No network, Unity import, Android build or device access is performed.
"""
import argparse
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRECTORY = ROOT / "UnityProjects/CrushXLensEngine/Assets/Plugins/Android/CrushXMediaCapture.androidlib/src/in/crushx/lens/capture"
SOURCES = [SOURCE_DIRECTORY / name for name in ("CrushXMediaRecorder.java", "CrushXGalleryExporter.java")]
TESTS = [ROOT / "tests/native_media" / name for name in ("CrushXMediaRecorderTests.java", "CrushXGalleryExporterTests.java")]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ecj", type=Path, required=True)
    parser.add_argument("--android-api", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Scratch directory outside committed sources")
    parser.add_argument("--java", default="java")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    # android-all bundles Java standard classes. Exclude those to avoid JDK9+
    # module package collisions; compile API calls against the Android classes.
    api = args.output / "android-api-no-java.jar"
    with zipfile.ZipFile(args.android_api) as source, zipfile.ZipFile(api, "w") as target:
        for entry in source.infolist():
            if not entry.filename.startswith(("java/", "javax/", "sun/", "jdk/", "org/w3c/", "org/xml/")):
                target.writestr(entry, source.read(entry.filename))
    classes = args.output / "classes"
    classes.mkdir(exist_ok=True)
    subprocess.run([args.java, "-jar", str(args.ecj), "-1.8", "-classpath", str(api), "-d", str(classes),
                    *(str(path) for path in (*SOURCES, *TESTS))], check=True)
    import os
    for name in ("CrushXMediaRecorderTests", "CrushXGalleryExporterTests"):
        subprocess.run([args.java, "-cp", os.pathsep.join((str(classes), str(api))), "in.crushx.lens.capture." + name], check=True)


if __name__ == "__main__":
    main()
