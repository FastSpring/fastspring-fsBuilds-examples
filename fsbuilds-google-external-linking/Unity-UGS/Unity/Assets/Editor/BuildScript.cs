using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Editor
{
    public static class BuildScript
    {
        private const string GameName = "FastSprintUnity";

        // ----------------- ANDROID ----------------- //
        public static void BuildAndroidWebView()
        {
            SetDefines(BuildTargetGroup.Android, "ANDROID_WEBVIEW");

            var buildPath = "Builds/Android-WebView";
            Directory.CreateDirectory(buildPath);

            BuildPipeline.BuildPlayer(
                GetScenes(),
                Path.Combine(buildPath, $"{GameName}-WebView.apk"),
                BuildTarget.Android,
                BuildOptions.None
            );
        }

        public static void BuildAndroidChromeTabs()
        {
            SetDefines(BuildTargetGroup.Android, "ANDROID_CHROMETABS");

            var buildPath = "Builds/Android-ChromeTabs";
            Directory.CreateDirectory(buildPath);

            BuildPipeline.BuildPlayer(
                GetScenes(),
                Path.Combine(buildPath, $"{GameName}-ChromeTabs.apk"),
                BuildTarget.Android,
                BuildOptions.None
            );
        }
        
        public static void BuildAndroidExternalChrome()
        {
            SetDefines(BuildTargetGroup.Android, "ANDROID_EXTERNALCHROME");

            var buildPath = "Builds/Android-ExternalChrome";
            Directory.CreateDirectory(buildPath);

            BuildPipeline.BuildPlayer(
                GetScenes(),
                Path.Combine(buildPath, $"{GameName}-ExternalChrome.apk"),
                BuildTarget.Android,
                BuildOptions.None
            );
        }

        // ----------------- IOS ----------------- //

        public static void BuildiOSDevice()
        {
            SetDefines(BuildTargetGroup.iOS, "IOS_DEVICE");

            var buildPath = "Builds/iOS-Device";
            Directory.CreateDirectory(buildPath);

            PlayerSettings.iOS.sdkVersion = iOSSdkVersion.DeviceSDK;
            PlayerSettings.SetArchitecture(BuildTargetGroup.iOS, 1); // ARM64

            BuildPipeline.BuildPlayer(
                GetScenes(),
                buildPath,
                BuildTarget.iOS,
                BuildOptions.None
            );

            Debug.Log($"iOS Device build finished at {buildPath}");
        }
        
        public static void BuildiOSDeviceWebView()
        {
            SetDefines(BuildTargetGroup.iOS, "IOS_DEVICE;USE_WKWEBVIEW");
            
            var buildPath = "Builds/iOS-Device-WebView";
            Directory.CreateDirectory(buildPath);

            PlayerSettings.iOS.sdkVersion = iOSSdkVersion.DeviceSDK;
            PlayerSettings.SetArchitecture(BuildTargetGroup.iOS, 1); // ARM64

            BuildPipeline.BuildPlayer(
                GetScenes(),
                buildPath,
                BuildTarget.iOS,
                BuildOptions.None
            );
        }

        public static void BuildiOSSimulator()
        {
            SetDefines(BuildTargetGroup.iOS, "IOS_SIMULATOR;USE_WKWEBVIEW");

            var path = "Builds/iOS-Simulator";
            Directory.CreateDirectory(path);

            PlayerSettings.iOS.sdkVersion = iOSSdkVersion.SimulatorSDK;
            PlayerSettings.SetArchitecture(BuildTargetGroup.iOS, 1); // x86_64
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.iOS, ScriptingImplementation.IL2CPP);

            BuildPlayerOptions opts = new BuildPlayerOptions
            {
                scenes = EditorBuildSettingsScene.GetActiveSceneList(EditorBuildSettings.scenes),
                locationPathName = path,
                target = BuildTarget.iOS,
                options = BuildOptions.Development
            };

            var report = BuildPipeline.BuildPlayer(opts);
            if (report.summary.result != BuildResult.Succeeded)
                Debug.LogError("iOS Simulator build failed!");
            else
                Debug.Log($"iOS Simulator build finished at {path}");
        }

        // ----------------- HELPERS ----------------- //

        private static string[] GetScenes()
        {
            return Array.ConvertAll(EditorBuildSettings.scenes, s => s.path);
        }

        private static void SetDefines(BuildTargetGroup group, string define)
        {
            PlayerSettings.SetScriptingDefineSymbolsForGroup(group, define);
            Debug.Log($"Set define symbols for {group}: {define}");
        }
    }
}