import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Array "mo:core/Array";
import Order "mo:core/Order";
import Runtime "mo:core/Runtime";
import Principal "mo:core/Principal";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";

actor {
  // Initialize the access control state
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  // User profile type
  public type UserProfile = {
    name : Text;
  };

  type Preset = {
    name : Text;
    data : Text; // JSON string (max ~8KB)
  };

  type CanvasSnapshot = {
    presetName : Text;
    data : Text; // JSON string (base64 pixel data, max ~64KB)
  };

  // Storage maps
  let userProfiles = Map.empty<Principal, UserProfile>();
  let presets = Map.empty<Principal, Map.Map<Text, Preset>>();
  let canvasSnapshots = Map.empty<Principal, Map.Map<Text, CanvasSnapshot>>();
  let factoryPresets = Map.empty<Text, Preset>();

  // User profile management (required by frontend)
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  // Preset management
  public shared ({ caller }) func savePreset(name : Text, data : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save presets");
    };
    
    let userData = { name; data };
    let userPresets = switch (presets.get(caller)) {
      case (?existing) { existing };
      case (null) { 
        let newMap = Map.empty<Text, Preset>();
        presets.add(caller, newMap);
        newMap;
      };
    };
    userPresets.add(name, userData);
  };

  public query ({ caller }) func loadPreset(name : Text) : async ?Preset {
    // Factory presets are accessible to everyone (including guests)
    switch (factoryPresets.get(name)) {
      case (?preset) { return ?preset };
      case (null) { };
    };
    
    // User presets require authentication
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      return null; // Guest can't access user presets
    };
    
    switch (presets.get(caller)) {
      case (?userPresets) {
        userPresets.get(name);
      };
      case (null) { null };
    };
  };

  public shared ({ caller }) func deletePreset(name : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can delete presets");
    };
    
    switch (presets.get(caller)) {
      case (?userPresets) {
        if (not userPresets.containsKey(name)) {
          Runtime.trap("Preset not found");
        };
        userPresets.remove(name);
      };
      case (null) { Runtime.trap("Preset not found") };
    };
  };

  public query ({ caller }) func listPresets() : async [Text] {
    // Factory presets are always included
    let factoryPresetNames = factoryPresets.keys().toArray();
    
    // User presets only if authenticated
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      return factoryPresetNames; // Guests only see factory presets
    };
    
    let userPresetNames = switch (presets.get(caller)) {
      case (?existing) { existing.keys().toArray() };
      case (null) { [] };
    };
    
    (factoryPresetNames.concat(userPresetNames)).sort();
  };

  // Canvas snapshot management
  public shared ({ caller }) func saveCanvasSnapshot(presetName : Text, data : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save snapshots");
    };
    
    let snapshot = { presetName; data };
    let userSnapshots = switch (canvasSnapshots.get(caller)) {
      case (?existing) { existing };
      case (null) { 
        let newMap = Map.empty<Text, CanvasSnapshot>();
        canvasSnapshots.add(caller, newMap);
        newMap;
      };
    };
    userSnapshots.add(presetName, snapshot);
  };

  public query ({ caller }) func loadCanvasSnapshot(presetName : Text) : async ?CanvasSnapshot {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can load snapshots");
    };
    
    switch (canvasSnapshots.get(caller)) {
      case (?userSnapshots) {
        userSnapshots.get(presetName);
      };
      case (null) { null };
    };
  };

  public shared ({ caller }) func deleteCanvasSnapshot(presetName : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can delete snapshots");
    };
    
    switch (canvasSnapshots.get(caller)) {
      case (?userSnapshots) {
        if (not userSnapshots.containsKey(presetName)) {
          Runtime.trap("Snapshot not found");
        };
        userSnapshots.remove(presetName);
      };
      case (null) { Runtime.trap("No snapshots found") };
    };
  };

  // Factory presets (read-only, accessible to all)
  public query func listFactoryPresets() : async [Text] {
    // No authentication required - factory presets are public
    factoryPresets.keys().toArray().sort();
  };

  public query func getFactoryPreset(name : Text) : async ?Preset {
    // No authentication required - factory presets are public
    factoryPresets.get(name);
  };

  // Initialize factory presets on canister start
  func initializeFactoryPresets() {
    let factoryPresetData = [
      ("Spectral Violin", "{\"type\":\"spectral_violin\",\"resonators\":[],\"effects\":{}}"),
      ("Glass Bell", "{\"type\":\"glass_bell\",\"resonators\":[],\"effects\":{}}"),
      ("Harmonic Harp", "{\"type\":\"harmonic_harp\",\"resonators\":[],\"effects\":{}}"),
      ("Pipe Organ Spectrum", "{\"type\":\"pipe_organ_spectrum\",\"resonators\":[],\"effects\":{}}"),
      ("Metal Drone", "{\"type\":\"metal_drone\",\"resonators\":[],\"effects\":{}}"),
      ("Resonant Pad", "{\"type\":\"resonant_pad\",\"resonators\":[],\"effects\":{}}"),
      ("Drum Resonator", "{\"type\":\"drum_resonator\",\"resonators\":[],\"effects\":{}}"),
      ("Alien Instrument", "{\"type\":\"alien_instrument\",\"resonators\":[],\"effects\":{}}"),
      ("Ambient Drone", "{\"type\":\"ambient_drone\",\"resonators\":[],\"effects\":{}}"),
      ("Experimental Hybrid", "{\"type\":\"experimental_hybrid\",\"resonators\":[],\"effects\":{}}"),
    ];
    
    for ((name, data) in factoryPresetData.vals()) {
      factoryPresets.add(name, { name; data });
    };
  };

  // System initialization
  system func preupgrade() {
    // Stable storage would go here if needed
  };

  system func postupgrade() {
    initializeFactoryPresets();
  };

  // Initialize on first deployment
  initializeFactoryPresets();
};
