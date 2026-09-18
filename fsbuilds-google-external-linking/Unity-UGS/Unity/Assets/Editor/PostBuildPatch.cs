using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using System.IO;
using System.Diagnostics;
using UnityEditor.iOS.Xcode;

public class PostBuildPatch : IPostprocessBuildWithReport
{
    public int callbackOrder => 999;

    public void OnPostprocessBuild(BuildReport report)
    {
        if (report.summary.platform != BuildTarget.iOS)
            return;

        string pathToBuiltProject = report.summary.outputPath;
        UnityEngine.Debug.Log($"📦 PostBuildPatch: Processing build at {pathToBuiltProject}");

        // Expected paths
        string librariesDir = Path.Combine(pathToBuiltProject, "Libraries");
        string simDylibPath = Path.Combine(librariesDir, "libiPhone-lib.dylib");

        string frameworkDir = Path.Combine(pathToBuiltProject, "Frameworks/UnityFramework.framework");
        string unityFrameworkBin = Path.Combine(frameworkDir, "UnityFramework");

        if (File.Exists(simDylibPath))
        {
            // Force UnityFramework to load libiPhone-lib from Libraries/
            RunCommand("install_name_tool", 
                $"-change \"@executable_path/../libiPhone-lib.dylib\" \"@executable_path/Libraries/libiPhone-lib.dylib\" \"{unityFrameworkBin}\"");

            RunCommand("install_name_tool", 
                $"-change \"@loader_path/libiPhone-lib.dylib\" \"@executable_path/Libraries/libiPhone-lib.dylib\" \"{unityFrameworkBin}\"");

            RunCommand("install_name_tool", 
                $"-change \"libiPhone-lib.dylib\" \"@executable_path/Libraries/libiPhone-lib.dylib\" \"{unityFrameworkBin}\"");

            UnityEngine.Debug.Log("🔧 Patched UnityFramework linkage to use Libraries/libiPhone-lib.dylib");
        }
        else
        {
            UnityEngine.Debug.Log("No libiPhone-lib.dylib found — assuming Device build (normal). Skipping dylib patch.");
        }
        

        var pbxproj = Path.Combine(pathToBuiltProject, "Unity-iPhone.xcodeproj/project.pbxproj");
        if (File.Exists(pbxproj))
        {
            var text = File.ReadAllText(pbxproj);

            if (!text.Contains("@executable_path/Frameworks"))
            {
                text = text.Replace("LD_RUNPATH_SEARCH_PATHS = (",
                    "LD_RUNPATH_SEARCH_PATHS = (\n\t\t\t\t\"@executable_path/Frameworks\",");
                File.WriteAllText(pbxproj, text);
                UnityEngine.Debug.Log(
                    "✅ Added @executable_path/Frameworks to LD_RUNPATH_SEARCH_PATHS in Xcode project.");
            }
        }
        
        // Add macro via PBXProject API
        var defines = PlayerSettings.GetScriptingDefineSymbolsForGroup(BuildTargetGroup.iOS);
        UnityEngine.Debug.Log("Trying to add preprocessor to Xcode project via PBXProject API.");

        if (File.Exists(pbxproj))
        {
            var proj = new PBXProject();
            proj.ReadFromFile(pbxproj);
            var mainTargetGuid = proj.GetUnityMainTargetGuid();
            var projDirty = false;

            if (defines.Contains("USE_WKWEBVIEW"))
            {
                var frameworkTargetGuid = proj.GetUnityFrameworkTargetGuid();

                proj.SetBuildProperty(mainTargetGuid, "GCC_PREPROCESSOR_DEFINITIONS", "USE_WKWEBVIEW=1");
                proj.SetBuildProperty(frameworkTargetGuid, "GCC_PREPROCESSOR_DEFINITIONS", "USE_WKWEBVIEW=1");

                proj.AddFrameworkToProject(frameworkTargetGuid, "WebKit.framework", false);
                proj.AddFrameworkToProject(mainTargetGuid, "WebKit.framework", false);

                projDirty = true;
                UnityEngine.Debug.Log("Added USE_WKWEBVIEW=1 to Xcode project via PBXProject API.");
            }

            if (ConfigureExternalPurchaseLink(pathToBuiltProject, proj, mainTargetGuid))
            {
                projDirty = true;
            }

            if (projDirty)
            {
                proj.WriteToFile(pbxproj);
            }
        }

        UnityEngine.Debug.Log("🚀 PostBuildPatch finished successfully.");
    }

    // EU (+ Japan, best-effort) member states Apple currently requires listed
    // in SKExternalPurchaseCustomLinkRegions — alpha-2, lowercase, per
    // Apple's own examples (their sample shows "de", "fr"). This is the
    // *legacy* EU entitlement path (com.apple.developer.storekit.external-
    // purchase-link + this plist key), which Apple's docs describe as still
    // valid alongside a newer unified entitlement
    // (com.apple.developer.storekit.custom-purchase-link.allowed-regions).
    // Which one this app actually receives depends on Apple's entitlement
    // grant, not on anything decided here — see
    // docs/apple-external-purchase-compliance.md. If Apple grants the newer
    // entitlement instead, swap the boolean key below for the new one; the
    // region list and Info.plist key stay the same either way.
    //
    // Japan is included best-effort per the user's ask, but
    // docs/apple-external-purchase-compliance.md flags an open question
    // (#4) about whether Japan's disclosure sheet needs a developer-built
    // UI now or can wait for Apple's promised system sheet — confirm before
    // actually shipping to the Japan storefront.
    private static readonly string[] ExternalPurchaseCustomLinkRegions =
    {
        "at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "de", "gr",
        "hu", "ie", "it", "lv", "lt", "lu", "mt", "nl", "pl", "pt", "ro", "sk",
        "si", "es", "se",
        "jp"
    };

    // Writes the entitlement + Info.plist configuration Apple's External
    // Purchase Custom Link program requires. Safe to run on every build:
    // both the entitlements plist and the Info.plist array are rewritten
    // from scratch rather than appended to, so re-running this never
    // accumulates duplicate entries. Inert until Apple actually grants the
    // entitlement — CheckEligibilityAsync at runtime is what gates whether
    // any of this is actually usable, not anything here.
    private static bool ConfigureExternalPurchaseLink(string pathToBuiltProject, PBXProject proj, string mainTargetGuid)
    {
        try
        {
            // No Unity ProjectCapabilityManager capability covers this
            // entitlement, so it's added the manual way: write a
            // .entitlements plist and point CODE_SIGN_ENTITLEMENTS at it.
            const string entitlementsRelativePath = "Unity-iPhone/Unity-iPhone.entitlements";
            var entitlementsFullPath = Path.Combine(pathToBuiltProject, entitlementsRelativePath);

            var entitlements = new PlistDocument();
            if (File.Exists(entitlementsFullPath))
            {
                entitlements.ReadFromFile(entitlementsFullPath);
            }
            entitlements.root.SetBoolean("com.apple.developer.storekit.external-purchase-link", true);

            var entitlementsDir = Path.GetDirectoryName(entitlementsFullPath);
            if (!string.IsNullOrEmpty(entitlementsDir))
            {
                Directory.CreateDirectory(entitlementsDir);
            }
            entitlements.WriteToFile(entitlementsFullPath);

            try
            {
                proj.AddFile(entitlementsRelativePath, entitlementsRelativePath, PBXSourceTree.Source);
            }
            catch (System.Exception e)
            {
                // Already added by a prior build in this same output
                // directory — not fatal, the build property below still
                // needs to be (re)set regardless.
                UnityEngine.Debug.Log($"[PostBuildPatch] Entitlements file already referenced in project (expected on a rebuild): {e.Message}");
            }
            proj.SetBuildProperty(mainTargetGuid, "CODE_SIGN_ENTITLEMENTS", entitlementsRelativePath);

            // Which regions this app supports custom external-purchase
            // links in.
            var infoPlistPath = Path.Combine(pathToBuiltProject, "Info.plist");
            var infoPlist = new PlistDocument();
            infoPlist.ReadFromFile(infoPlistPath);

            if (infoPlist.root.values.ContainsKey("SKExternalPurchaseCustomLinkRegions"))
            {
                infoPlist.root.values.Remove("SKExternalPurchaseCustomLinkRegions");
            }
            var regionsArray = infoPlist.root.CreateArray("SKExternalPurchaseCustomLinkRegions");
            foreach (var region in ExternalPurchaseCustomLinkRegions)
            {
                regionsArray.AddString(region);
            }
            infoPlist.WriteToFile(infoPlistPath);

            UnityEngine.Debug.Log($"✅ Configured External Purchase Custom Link entitlement + {ExternalPurchaseCustomLinkRegions.Length} regions in Info.plist.");
            return true;
        }
        catch (System.Exception e)
        {
            UnityEngine.Debug.LogError($"❌ Failed to configure External Purchase Custom Link entitlement/Info.plist: {e.Message}");
            return false;
        }
    }

    private static void RunCommand(string cmd, string args)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = cmd,
                Arguments = args,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            using (var p = Process.Start(psi))
            {
                p.WaitForExit();
                if (p.ExitCode != 0)
                {
                    UnityEngine.Debug.LogWarning($"⚠️ Command {cmd} {args} failed:\n{p.StandardError.ReadToEnd()}");
                }
                else
                {
                    string output = p.StandardOutput.ReadToEnd();
                    if (!string.IsNullOrEmpty(output))
                        UnityEngine.Debug.Log(output);
                }
            }
        }
        catch (System.Exception ex)
        {
            UnityEngine.Debug.LogError($"❌ Failed to run {cmd} {args}: {ex.Message}");
        }
    }
}