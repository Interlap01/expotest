/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  // The widget reads what the app shares through the app group.
  entitlements: {
    "com.apple.security.application-groups": ["group.run.mobai.expotest"],
  },
});