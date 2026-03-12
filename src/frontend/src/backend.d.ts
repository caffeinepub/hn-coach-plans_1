import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Member {
    age: string;
    weight: string;
    height: string;
    endDate: bigint;
    city: string;
    goal: string;
    createdAt: bigint;
    plan: string;
    fullName: string;
    referredBy: string;
    whatsappNo: string;
    startDate: bigint;
}
export interface Coupon {
    code: string;
    createdAt: bigint;
    discountPct: bigint;
}
export interface backendInterface {
    addCoupon(code: string, discountPct: bigint): Promise<boolean>;
    deleteCoupon(code: string): Promise<boolean>;
    getAllCoupons(): Promise<Array<Coupon>>;
    getAllMembers(): Promise<Array<Member>>;
    getMember(whatsappNo: string): Promise<Member | null>;
    getReferralCount(whatsappNo: string): Promise<bigint>;
    registerMember(whatsappNo: string, fullName: string, age: string, height: string, weight: string, city: string, goal: string, plan: string, startDate: bigint, endDate: bigint, referredBy: string): Promise<boolean>;
    updateMember(whatsappNo: string, fullName: string, age: string, height: string, weight: string, city: string, goal: string, plan: string, startDate: bigint, endDate: bigint): Promise<boolean>;
    validateCoupon(code: string): Promise<bigint | null>;
}
