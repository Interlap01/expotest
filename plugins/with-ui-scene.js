const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

// Apps built with the newer iOS SDKs must use the UIScene life cycle, and
// the AppDelegate prebuild writes has none. This adds the scene manifest
// and a scene delegate that starts React Native in the scene's window, in
// place of the window the app delegate made.
module.exports = function withUIScene(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return c;
  });
  return withAppDelegate(config, (c) => {
    let src = c.modResults.contents;
    if (c.modResults.language !== "swift" || src.includes("class SceneDelegate")) {
      return c;
    }
    const start = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
    if (!start.test(src)) {
      throw new Error("with-ui-scene: AppDelegate.swift no longer starts React Native the way this plugin expects");
    }
    src = src.replace(start, "");
    src += `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
  }
}
`;
    c.modResults.contents = src;
    return c;
  });
};
