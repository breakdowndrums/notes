function useKeepAwake() {
  // No-op shim for Expo dev tooling on Android where keep-awake can throw.
}

module.exports = {
  ExpoKeepAwakeTag: 'expo-dev-shim',
  activateKeepAwakeAsync: async () => undefined,
  deactivateKeepAwake: () => undefined,
  deactivateKeepAwakeAsync: async () => undefined,
  useKeepAwake,
};
