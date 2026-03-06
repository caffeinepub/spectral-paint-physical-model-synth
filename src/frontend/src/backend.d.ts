import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Preset {
    data: string;
    name: string;
}
export interface UserProfile {
    name: string;
}
export interface CanvasSnapshot {
    data: string;
    presetName: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    deleteCanvasSnapshot(presetName: string): Promise<void>;
    deletePreset(name: string): Promise<void>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getFactoryPreset(name: string): Promise<Preset | null>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    listFactoryPresets(): Promise<Array<string>>;
    listPresets(): Promise<Array<string>>;
    loadCanvasSnapshot(presetName: string): Promise<CanvasSnapshot | null>;
    loadPreset(name: string): Promise<Preset | null>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    saveCanvasSnapshot(presetName: string, data: string): Promise<void>;
    savePreset(name: string, data: string): Promise<void>;
}
