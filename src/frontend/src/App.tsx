import type { Member, backendInterface } from "@/backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActor } from "@/hooks/useActor";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  PenLine,
  Plus,
  RefreshCw,
  Star,
  Tag,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

/* ─── Razorpay global type ──────────────────────────────────────────────── */

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/* ─── Types ──────────────────────────────────────────────────────────────── */

type PlanView = "regular" | "premium";
type DurationDays = 20 | 40 | 60;
type Goal =
  | "Weight Loss"
  | "Weight Gain"
  | "Belly Fat Loss"
  | "Increase Energy";

type AppView = "pricing" | "track" | "admin";

interface FormData {
  fullName: string;
  age: string;
  height: string;
  weight: string;
  deliveryAddress: string;
  pincode: string;
  email: string;
  whatsappNo: string;
  goal: Goal | "";
  invitedBy: string;
}

interface FormErrors {
  fullName?: string;
  age?: string;
  height?: string;
  weight?: string;
  deliveryAddress?: string;
  pincode?: string;
  email?: string;
  whatsappNo?: string;
  goal?: string;
  invitedBy?: string;
}

/* ─── Date helpers ──────────────────────────────────────────────────────── */

const DAY_NS = BigInt(24 * 60 * 60 * 1000 * 1_000_000);

function nowNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

function nsToMs(ns: bigint): number {
  return Number(ns / 1_000_000n);
}

function daysRemaining(endNs: bigint): number {
  const ms = nsToMs(endNs) - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function formatDate(ns: bigint): string {
  const d = new Date(nsToMs(ns));
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function dateToNs(dateStr: string): bigint {
  return BigInt(new Date(dateStr).getTime()) * 1_000_000n;
}

function nsToDateStr(ns: bigint): string {
  return new Date(nsToMs(ns)).toISOString().slice(0, 10);
}

/* ─── Pricing helpers ───────────────────────────────────────────────────── */

function fmtINR(amount: number): string {
  return `Rs.\u00a0${amount.toLocaleString("en-IN")}`;
}

interface PriceInfo {
  finalPrice: number;
  originalPrice: number | null;
  savingAmount: number | null;
  discountPct: number | null;
}

function calcPrice(basePrice: number, days: DurationDays): PriceInfo {
  if (days === 20) {
    return {
      finalPrice: basePrice,
      originalPrice: null,
      savingAmount: null,
      discountPct: null,
    };
  }
  if (days === 40) {
    const original = basePrice * 2;
    const saving = Math.round(original * 0.1);
    return {
      finalPrice: original - saving,
      originalPrice: original,
      savingAmount: saving,
      discountPct: 10,
    };
  }
  // 60 days
  const original = basePrice * 3;
  const saving = Math.round(original * 0.2);
  return {
    finalPrice: original - saving,
    originalPrice: original,
    savingAmount: saving,
    discountPct: 20,
  };
}

const REGULAR_BASE = 5632;
const PREMIUM_BASE = 8464;

/* ─── Shared input inline style ─────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  background: "oklch(0.17 0.010 285)",
  border: "1px solid oklch(0.28 0.010 285)",
  color: "oklch(0.95 0 0)",
  fontSize: "0.9rem",
};

/* ─── Form Field Wrapper ─────────────────────────────────────────────────── */

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        className="font-sans text-sm font-semibold"
        style={{ color: "oklch(0.80 0 0)" }}
      >
        {label}{" "}
        {required && <span style={{ color: "oklch(0.72 0.19 45)" }}>*</span>}
        {!required && (
          <span
            className="font-normal text-xs ml-1"
            style={{ color: "oklch(0.45 0 0)" }}
          >
            (optional)
          </span>
        )}
      </Label>
      {children}
      {error && (
        <p
          className="font-sans text-xs"
          style={{ color: "oklch(0.72 0.22 25)" }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/* ─── Razorpay script loader ─────────────────────────────────────────────── */

function useRazorpayScript() {
  useEffect(() => {
    if (document.getElementById("razorpay-script")) return;
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);
}

const RAZORPAY_KEY = "rzp_live_SNoVPUAavv60C9";

/* ─── Intake Form Modal ──────────────────────────────────────────────────── */

const GOALS: Goal[] = [
  "Weight Loss",
  "Weight Gain",
  "Belly Fat Loss",
  "Increase Energy",
];

const PLAN_DAYS: Record<string, number> = {
  "Regular Plan - 20 Days": 20,
  "Regular Plan - 40 Days": 40,
  "Regular Plan - 60 Days": 60,
  "Premium Plan - 20 Days": 20,
  "Premium Plan - 40 Days": 40,
  "Premium Plan - 60 Days": 60,
};

function IntakeFormModal({
  open,
  onClose,
  planName,
  planPrice,
  actor,
}: {
  open: boolean;
  onClose: () => void;
  planName: string;
  planPrice: number;
  actor: backendInterface | null;
}) {
  // Read invitedBy from URL ?ref= param (locked if present)
  const urlRef = new URLSearchParams(window.location.search).get("ref") ?? "";

  const [form, setForm] = useState<FormData>({
    fullName: "",
    age: "",
    height: "",
    weight: "",
    deliveryAddress: "",
    pincode: "",
    email: "",
    whatsappNo: "",
    goal: "",
    invitedBy: urlRef,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponStatus, setCouponStatus] = useState<
    "idle" | "valid" | "invalid" | "checking"
  >("idle");

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponStatus("checking");
    try {
      const result = await actor?.validateCoupon(code);
      if (result !== null && result !== undefined) {
        setCouponDiscount(Number(result));
        setCouponStatus("valid");
      } else {
        setCouponDiscount(0);
        setCouponStatus("invalid");
      }
    } catch {
      setCouponDiscount(0);
      setCouponStatus("invalid");
    }
  }

  const discountedPrice =
    couponDiscount > 0
      ? Math.round(planPrice * (1 - couponDiscount / 100))
      : planPrice;

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!form.fullName.trim()) e.fullName = "Full name is required";
    if (!form.age.trim()) e.age = "Age is required";
    if (!form.height.trim()) e.height = "Height is required";
    if (!form.weight.trim()) e.weight = "Weight is required";
    if (!form.deliveryAddress.trim())
      e.deliveryAddress = "Delivery address is required";
    if (!form.pincode.trim()) e.pincode = "Pincode is required";
    if (!form.whatsappNo.trim()) e.whatsappNo = "WhatsApp number is required";
    if (!form.invitedBy.trim()) e.invitedBy = "Who invited you can't be blank";
    if (!form.goal) e.goal = "Please select a goal";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setSubmitted(true);
      return;
    }

    setSaving(true);

    const options: Record<string, unknown> = {
      key: RAZORPAY_KEY,
      amount: discountedPrice * 100, // paise
      currency: "INR",
      name: "HN Coach",
      description: planName,
      prefill: {
        name: form.fullName,
        contact: form.whatsappNo,
      },
      theme: { color: "#e07b26" },
      handler: (response: { razorpay_payment_id: string }) => {
        // Save to backend (don't block on failure)
        const start = nowNs();
        const days = PLAN_DAYS[planName] ?? 20;
        const end = start + BigInt(days) * DAY_NS;
        actor
          ?.registerMember(
            form.whatsappNo.trim(),
            form.fullName.trim(),
            form.age.trim(),
            form.height.trim(),
            form.weight.trim(),
            `${form.deliveryAddress.trim()}, ${form.pincode.trim()}`,
            form.goal as string,
            planName,
            start,
            end,
            "",
          )
          .catch(() => {});

        // Send WhatsApp message with payment confirmation
        const messageParts = [
          "Hello HN Coach! Payment successful. Here are my details:",
          "",
          `Payment ID: ${response.razorpay_payment_id}`,
          `Name: ${form.fullName}`,
          `Age: ${form.age}`,
          `Height: ${form.height}`,
          `Weight: ${form.weight}`,
          `Delivery Address: ${form.deliveryAddress}`,
          `Pincode: ${form.pincode}`,
          `Email: ${form.email || "Not provided"}`,
          `WhatsApp: ${form.whatsappNo}`,
          `Goal: ${form.goal}`,
          `Plan: ${planName}`,
        ];
        if (form.invitedBy) messageParts.push(`Invited By: ${form.invitedBy}`);
        if (couponDiscount > 0)
          messageParts.push(
            `Coupon Applied: ${couponCode.trim().toUpperCase()} (${couponDiscount}% off) — Paid: ₹${discountedPrice}`,
          );
        messageParts.push("", "Please confirm my membership activation!");
        const message = messageParts.join("\n");

        window.open(
          `https://wa.me/919155348866?text=${encodeURIComponent(message)}`,
          "_blank",
          "noopener,noreferrer",
        );
        setSaving(false);
        onClose();
      },
    };

    // @ts-ignore
    const rzp = new window.Razorpay(options);
    rzp.open();
    setSaving(false);
  }

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (submitted) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function handleClose() {
    setForm({
      fullName: "",
      age: "",
      height: "",
      weight: "",
      deliveryAddress: "",
      pincode: "",
      email: "",
      whatsappNo: "",
      goal: "",
      invitedBy: urlRef,
    });
    setErrors({});
    setSubmitted(false);
    setCouponCode("");
    setCouponDiscount(0);
    setCouponStatus("idle");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        data-ocid="intake.modal"
        className="max-w-lg w-full p-0 gap-0 border-0 overflow-hidden"
        style={{
          background: "oklch(0.12 0.010 285)",
          border: "1px solid oklch(0.28 0.012 285)",
          boxShadow:
            "0 24px 80px oklch(0.05 0.008 285 / 0.95), 0 0 0 1px oklch(0.72 0.19 45 / 0.08)",
        }}
      >
        {/* Ambient glow top */}
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent, oklch(0.72 0.19 45 / 0.5) 50%, transparent)",
          }}
          aria-hidden="true"
        />

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 mb-3">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.72 0.19 45)" }}
                />
                <span
                  className="font-sans text-[0.65rem] font-bold tracking-[0.22em] uppercase"
                  style={{ color: "oklch(0.72 0.19 45)" }}
                >
                  {planName}
                </span>
              </div>
              <DialogTitle className="font-display text-2xl font-black tracking-tight text-foreground leading-tight">
                Almost there!{" "}
                <span
                  className="block"
                  style={{ color: "oklch(0.72 0.19 45)" }}
                >
                  Tell us about yourself
                </span>
              </DialogTitle>
              <p
                className="font-sans text-sm mt-1.5"
                style={{ color: "oklch(0.58 0 0)" }}
              >
                Fill in your details to proceed to payment.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable form body */}
        <ScrollArea className="max-h-[65vh] mt-5">
          <form
            id="intake-form"
            onSubmit={handleSubmit}
            noValidate
            className="px-6 pb-6 space-y-4"
          >
            {/* Full Name */}
            <FormField label="Full Name" required error={errors.fullName}>
              <Input
                data-ocid="form.fullname.input"
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={form.fullName}
                onChange={(e) => handleChange("fullName", e.target.value)}
                autoComplete="name"
                className="form-input"
                style={inputStyle}
              />
            </FormField>

            {/* Age + Height row */}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Age" required error={errors.age}>
                <Input
                  data-ocid="form.age.input"
                  type="number"
                  placeholder="e.g. 28"
                  min="10"
                  max="100"
                  value={form.age}
                  onChange={(e) => handleChange("age", e.target.value)}
                  className="form-input"
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Height" required error={errors.height}>
                <Input
                  data-ocid="form.height.input"
                  type="text"
                  placeholder={"e.g. 5'7\" or 170cm"}
                  value={form.height}
                  onChange={(e) => handleChange("height", e.target.value)}
                  className="form-input"
                  style={inputStyle}
                />
              </FormField>
            </div>

            {/* Weight row */}
            <FormField label="Weight" required error={errors.weight}>
              <Input
                data-ocid="form.weight.input"
                type="text"
                placeholder="e.g. 70 kg"
                value={form.weight}
                onChange={(e) => handleChange("weight", e.target.value)}
                className="form-input"
                style={inputStyle}
              />
            </FormField>

            {/* Delivery Address */}
            <FormField
              label="Delivery Address"
              required
              error={errors.deliveryAddress}
            >
              <Input
                data-ocid="form.delivery_address.input"
                type="text"
                placeholder="e.g. Flat 12, Green Park Colony, Mumbai"
                value={form.deliveryAddress}
                onChange={(e) =>
                  handleChange("deliveryAddress", e.target.value)
                }
                autoComplete="street-address"
                className="form-input"
                style={inputStyle}
              />
            </FormField>

            {/* Pincode */}
            <FormField label="Pincode" required error={errors.pincode}>
              <Input
                data-ocid="form.pincode.input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="e.g. 400001"
                value={form.pincode}
                onChange={(e) => handleChange("pincode", e.target.value)}
                autoComplete="postal-code"
                className="form-input"
                style={inputStyle}
              />
            </FormField>

            {/* Email */}
            <FormField label="Email" required={false} error={errors.email}>
              <Input
                data-ocid="form.email.input"
                type="email"
                placeholder="e.g. rahul@example.com"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                autoComplete="email"
                className="form-input"
                style={inputStyle}
              />
            </FormField>

            {/* WhatsApp No. */}
            <FormField label="WhatsApp No." required error={errors.whatsappNo}>
              <Input
                data-ocid="form.whatsapp.input"
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={form.whatsappNo}
                onChange={(e) => handleChange("whatsappNo", e.target.value)}
                autoComplete="tel"
                className="form-input"
                style={inputStyle}
              />
            </FormField>

            {/* Invited By */}
            <FormField
              label="Who Invited You?"
              required
              error={errors.invitedBy}
            >
              <Input
                data-ocid="form.invited_by.input"
                type="text"
                placeholder="e.g. +91 98765 43210 (WhatsApp of referrer)"
                value={form.invitedBy}
                onChange={(e) =>
                  !urlRef && handleChange("invitedBy", e.target.value)
                }
                readOnly={!!urlRef}
                className="form-input"
                style={{
                  ...inputStyle,
                  opacity: urlRef ? 0.65 : 1,
                  cursor: urlRef ? "not-allowed" : "text",
                  borderColor: errors.invitedBy
                    ? "oklch(0.65 0.22 25)"
                    : undefined,
                }}
              />
              {urlRef && (
                <p
                  className="font-sans text-[0.7rem] mt-1"
                  style={{ color: "oklch(0.55 0 0)" }}
                >
                  Referral locked — this field cannot be changed.
                </p>
              )}
            </FormField>

            {/* Coupon Code */}
            <FormField label="Coupon Code" required={false} error={undefined}>
              <div className="flex gap-2">
                <Input
                  data-ocid="form.coupon.input"
                  type="text"
                  placeholder="e.g. SAVE10"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    setCouponStatus("idle");
                    setCouponDiscount(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                  className="form-input flex-1"
                  style={{
                    ...inputStyle,
                    borderColor:
                      couponStatus === "valid"
                        ? "oklch(0.70 0.18 145)"
                        : couponStatus === "invalid"
                          ? "oklch(0.65 0.22 25)"
                          : undefined,
                  }}
                />
                <button
                  type="button"
                  data-ocid="form.coupon.button"
                  onClick={applyCoupon}
                  disabled={couponStatus === "checking" || !couponCode.trim()}
                  className="px-4 py-2 rounded-xl font-sans text-sm font-semibold transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
                  style={{
                    background: "oklch(0.72 0.19 45 / 0.15)",
                    border: "1px solid oklch(0.72 0.19 45 / 0.5)",
                    color: "oklch(0.72 0.19 45)",
                  }}
                >
                  {couponStatus === "checking" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Apply"
                  )}
                </button>
              </div>
              {couponStatus === "valid" && (
                <p
                  className="font-sans text-xs mt-1.5 font-semibold"
                  style={{ color: "oklch(0.70 0.18 145)" }}
                >
                  ✓ Coupon applied! {couponDiscount}% off
                </p>
              )}
              {couponStatus === "invalid" && (
                <p
                  className="font-sans text-xs mt-1.5"
                  style={{ color: "oklch(0.65 0.22 25)" }}
                >
                  ✗ Invalid coupon code
                </p>
              )}
            </FormField>

            {/* Price summary if coupon applied */}
            {couponStatus === "valid" && couponDiscount > 0 && (
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{
                  background: "oklch(0.70 0.18 145 / 0.08)",
                  border: "1px solid oklch(0.70 0.18 145 / 0.3)",
                }}
              >
                <span
                  className="font-sans text-sm"
                  style={{ color: "oklch(0.70 0.18 145)" }}
                >
                  Amount to pay
                </span>
                <div className="flex items-center gap-2.5">
                  <span
                    className="font-sans text-sm line-through"
                    style={{ color: "oklch(0.45 0 0)" }}
                  >
                    ₹{planPrice.toLocaleString("en-IN")}
                  </span>
                  <span
                    className="font-display text-lg font-black"
                    style={{ color: "oklch(0.70 0.18 145)" }}
                  >
                    ₹{discountedPrice.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}

            {/* Goal */}
            <div className="space-y-2">
              <Label
                className="font-sans text-sm font-semibold"
                style={{ color: "oklch(0.80 0 0)" }}
              >
                Your Goal{" "}
                <span style={{ color: "oklch(0.72 0.19 45)" }}>*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {GOALS.map((g) => {
                  const ocidMap: Record<Goal, string> = {
                    "Weight Loss": "form.goal.weight_loss.radio",
                    "Weight Gain": "form.goal.weight_gain.radio",
                    "Belly Fat Loss": "form.goal.belly_fat.radio",
                    "Increase Energy": "form.goal.energy.radio",
                  };
                  const isSelected = form.goal === g;
                  return (
                    <label
                      key={g}
                      className="relative flex items-center px-3 py-2.5 rounded-xl font-sans text-sm font-semibold cursor-pointer transition-all duration-150"
                      style={{
                        background: isSelected
                          ? "oklch(0.72 0.19 45 / 0.15)"
                          : "oklch(0.17 0.010 285)",
                        border: `1px solid ${
                          isSelected
                            ? "oklch(0.72 0.19 45 / 0.7)"
                            : "oklch(0.28 0.010 285)"
                        }`,
                        color: isSelected
                          ? "oklch(0.72 0.19 45)"
                          : "oklch(0.65 0 0)",
                        boxShadow: isSelected
                          ? "0 0 12px oklch(0.72 0.19 45 / 0.12)"
                          : "none",
                      }}
                    >
                      <input
                        type="radio"
                        name="goal"
                        value={g}
                        checked={isSelected}
                        data-ocid={ocidMap[g]}
                        onChange={() => {
                          handleChange("goal", g);
                          if (submitted)
                            setErrors((prev) => ({
                              ...prev,
                              goal: undefined,
                            }));
                        }}
                        className="sr-only"
                      />
                      {isSelected && (
                        <span
                          className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ background: "oklch(0.72 0.19 45)" }}
                        >
                          <svg
                            width="8"
                            height="6"
                            viewBox="0 0 8 6"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M1 3L3 5L7 1"
                              stroke="oklch(0.10 0 0)"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                      {g}
                    </label>
                  );
                })}
              </div>
              {errors.goal && (
                <p
                  className="font-sans text-xs mt-1"
                  style={{ color: "oklch(0.72 0.22 25)" }}
                  role="alert"
                >
                  {errors.goal}
                </p>
              )}
            </div>
          </form>
        </ScrollArea>

        {/* Footer actions */}
        <div
          className="px-6 py-4 flex gap-3"
          style={{
            borderTop: "1px solid oklch(0.22 0.008 285)",
            background: "oklch(0.10 0.008 285)",
          }}
        >
          <button
            type="button"
            data-ocid="form.cancel_button"
            onClick={handleClose}
            className="flex-none px-5 py-3 rounded-xl font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            style={{
              background: "oklch(0.18 0.010 285)",
              border: "1px solid oklch(0.28 0.010 285)",
              color: "oklch(0.60 0 0)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="intake-form"
            data-ocid="form.submit_button"
            disabled={saving}
            className="flex-1 py-3 px-5 rounded-xl font-display text-[0.9rem] font-black tracking-[0.1em] uppercase flex items-center justify-center gap-2.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60 disabled:pointer-events-none"
            style={{
              background: "oklch(0.72 0.19 45)",
              color: "oklch(0.10 0 0)",
              boxShadow: "0 4px 20px oklch(0.72 0.19 45 / 0.4)",
            }}
          >
            {saving ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <CreditCard size={17} />
            )}
            {saving ? "Opening Payment..." : "Pay Now"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Gradient Border Card Wrapper ──────────────────────────────────────── */

function GradientBorderCard({
  children,
  className = "",
  featured = false,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  featured?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="relative rounded-2xl p-px"
      style={{
        background: featured
          ? "linear-gradient(135deg, oklch(0.72 0.19 45 / 0.9) 0%, oklch(0.72 0.19 45 / 0.3) 40%, oklch(0.25 0.010 285) 100%)"
          : "linear-gradient(135deg, oklch(0.72 0.19 45 / 0.35) 0%, oklch(0.25 0.010 285) 50%, oklch(0.72 0.19 45 / 0.12) 100%)",
        ...style,
      }}
    >
      <div
        className={`relative rounded-2xl bg-card overflow-hidden ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Feature List Item ──────────────────────────────────────────────────── */

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-[3px] flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-full"
        style={{
          background: "oklch(0.72 0.19 45 / 0.15)",
          border: "1px solid oklch(0.72 0.19 45 / 0.35)",
        }}
      >
        <svg
          width="10"
          height="8"
          viewBox="0 0 10 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="oklch(0.72 0.19 45)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="font-sans text-[0.9rem] leading-snug text-foreground/85">
        {text}
      </span>
    </li>
  );
}

/* ─── CTA Button ─────────────────────────────────────────────────────────── */

function CtaButton({
  onClick,
  ocid,
  shadow = "0 4px 24px oklch(0.72 0.19 45 / 0.35)",
}: {
  onClick: () => void;
  ocid: string;
  shadow?: string;
}) {
  return (
    <button
      type="button"
      data-ocid={ocid}
      onClick={onClick}
      className="
        w-full py-[1.1rem] px-6
        font-display text-[1rem] font-black tracking-[0.12em] uppercase
        rounded-xl
        transition-all duration-200
        hover:scale-[1.025] active:scale-[0.975]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card
        flex items-center justify-center gap-2
      "
      style={{
        background: "oklch(0.72 0.19 45)",
        color: "oklch(0.10 0 0)",
        boxShadow: shadow,
      }}
    >
      <CreditCard size={18} />
      Pay Now
    </button>
  );
}

/* ─── Duration Selector ──────────────────────────────────────────────────── */

function DurationSelector({
  selected,
  onChange,
  scope,
}: {
  selected: DurationDays;
  onChange: (d: DurationDays) => void;
  scope: string;
}) {
  const durations: DurationDays[] = [20, 40, 60];
  return (
    <div
      className="inline-flex items-center rounded-full p-1 gap-1"
      style={{
        background: "oklch(0.16 0.010 285)",
        border: "1px solid oklch(0.26 0.010 285)",
      }}
    >
      {durations.map((d) => {
        const isActive = selected === d;
        return (
          <button
            key={d}
            type="button"
            data-ocid={`${scope}.duration_${d}.toggle`}
            onClick={() => onChange(d)}
            className="relative px-5 py-2 rounded-full font-display text-[0.75rem] font-black tracking-[0.08em] uppercase transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: isActive ? "oklch(0.72 0.19 45)" : "transparent",
              color: isActive ? "oklch(0.10 0 0)" : "oklch(0.52 0 0)",
              boxShadow: isActive
                ? "0 2px 10px oklch(0.72 0.19 45 / 0.35)"
                : "none",
            }}
          >
            {d} Days
          </button>
        );
      })}
    </div>
  );
}

/* ─── Price Display ──────────────────────────────────────────────────────── */

function PriceDisplay({ priceInfo }: { priceInfo: PriceInfo }) {
  return (
    <div className="mb-8">
      {priceInfo.originalPrice !== null ? (
        <>
          <div className="flex items-baseline gap-3 mb-2">
            <span
              className="font-sans text-sm line-through"
              style={{
                color: "oklch(0.55 0 0)",
                textDecorationThickness: "1.5px",
              }}
            >
              {fmtINR(priceInfo.originalPrice)}
            </span>
          </div>
          <div className="mb-3">
            <span
              className="font-display font-black leading-none text-foreground"
              style={{ fontSize: "clamp(2.5rem, 8vw, 3.5rem)" }}
            >
              {fmtINR(priceInfo.finalPrice)}
            </span>
          </div>
          <div className="flex">
            <span
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-sans text-[0.7rem] font-bold tracking-wide"
              style={{
                background: "oklch(0.72 0.19 45)",
                color: "oklch(0.10 0 0)",
              }}
            >
              Save {fmtINR(priceInfo.savingAmount!)} ({priceInfo.discountPct}%
              off)
            </span>
          </div>
        </>
      ) : (
        <div>
          <span
            className="font-display font-black leading-none text-foreground"
            style={{ fontSize: "clamp(2.5rem, 8vw, 3.5rem)" }}
          >
            {fmtINR(priceInfo.finalPrice)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Regular Plan Card ──────────────────────────────────────────────────── */

function RegularPlanCard({
  onGetStarted,
}: {
  onGetStarted: (planLabel: string, planPrice: number) => void;
}) {
  const [duration, setDuration] = useState<DurationDays>(20);
  const priceInfo = calcPrice(REGULAR_BASE, duration);

  return (
    <motion.div
      key="regular"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      data-ocid="pricing.regular.card"
      className="w-full max-w-lg mx-auto"
    >
      <GradientBorderCard
        featured={false}
        className="p-8 md:p-10 transition-shadow duration-300"
        style={{ boxShadow: "0 12px 48px oklch(0.05 0.008 285 / 0.9)" }}
      >
        <div className="flex justify-start mb-5">
          <span
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-display text-[0.65rem] font-black tracking-[0.18em] uppercase"
            style={{
              background: "oklch(0.72 0.19 45 / 0.15)",
              border: "1px solid oklch(0.72 0.19 45 / 0.4)",
              color: "oklch(0.72 0.19 45)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "oklch(0.72 0.19 45)" }}
            />
            Regular Plan
          </span>
        </div>

        <h2 className="font-display text-3xl md:text-[2.6rem] font-black text-foreground leading-none tracking-tight mb-5">
          Transformation Plan
        </h2>

        {/* Duration selector */}
        <div className="mb-7">
          <DurationSelector
            selected={duration}
            onChange={setDuration}
            scope="regular"
          />
        </div>

        <PriceDisplay priceInfo={priceInfo} />

        <div
          className="mb-7"
          style={{ height: "1px", background: "oklch(0.72 0.19 45 / 0.12)" }}
        />

        <ul className="space-y-3.5 mb-6">
          <FeatureItem text={`${duration} Ideal Breakfast`} />
          <FeatureItem text="Personal Coach" />
          <FeatureItem text="WhatsApp Support" />
          <FeatureItem text="Weekly Tracking & Progress Report" />
          <FeatureItem text="Weekly Counselling Session" />
          <FeatureItem text="Live Exercise Classes" />
          <FeatureItem text="2 Nutrition Classes Weekly" />
          <FeatureItem text="Meal Planning Guidance" />
          <FeatureItem text="Mindset & Motivation Coaching" />
          <FeatureItem text="Offline Event Access" />
          <FeatureItem text="Business Opportunity on Achieving Ideal Weight" />
          <FeatureItem text="10% Off Coupon for a Friend" />
        </ul>

        {duration === 20 && (
          <div
            className="mb-7 flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: "oklch(0.55 0.18 145 / 0.12)",
              border: "1.5px solid oklch(0.65 0.18 145 / 0.55)",
            }}
            data-ocid="pricing.regular.moneyback.panel"
          >
            <span className="text-xl flex-shrink-0">🛡️</span>
            <div>
              <p
                className="font-display text-[0.75rem] font-black tracking-[0.1em] uppercase leading-none mb-0.5"
                style={{ color: "oklch(0.72 0.18 145)" }}
              >
                30-Day Money Back Guarantee
              </p>
              <p
                className="font-sans text-[0.72rem] leading-snug"
                style={{ color: "oklch(0.65 0.08 145)" }}
              >
                Not satisfied? Get a full refund within 30 days — no questions
                asked.
              </p>
            </div>
          </div>
        )}

        <CtaButton
          ocid="pricing.regular.button"
          onClick={() =>
            onGetStarted(
              `Regular Plan - ${duration} Days`,
              priceInfo.finalPrice,
            )
          }
          shadow="0 4px 24px oklch(0.72 0.19 45 / 0.35)"
        />

        <div
          className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.19 45 / 0.06), transparent 70%)",
          }}
        />
      </GradientBorderCard>
    </motion.div>
  );
}

/* ─── Premium Plan Card ──────────────────────────────────────────────────── */

function PremiumPlanCard({
  onGetStarted,
}: {
  onGetStarted: (planLabel: string, planPrice: number) => void;
}) {
  const [duration, setDuration] = useState<DurationDays>(20);
  const priceInfo = calcPrice(PREMIUM_BASE, duration);

  return (
    <motion.div
      key="premium"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      data-ocid="pricing.premium.card"
      className="w-full max-w-lg mx-auto"
    >
      <GradientBorderCard
        featured={true}
        className="p-8 md:p-10 transition-shadow duration-300"
        style={{
          boxShadow:
            "0 12px 60px oklch(0.72 0.19 45 / 0.14), 0 2px 20px oklch(0.05 0.008 285 / 0.9)",
        }}
      >
        <div className="flex justify-start mb-5">
          <span
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-display text-[0.65rem] font-black tracking-[0.18em] uppercase"
            style={{
              background: "oklch(0.72 0.19 45)",
              color: "oklch(0.10 0 0)",
            }}
          >
            <Star size={10} fill="oklch(0.10 0 0)" />
            Premium Plan
          </span>
        </div>

        <h2 className="font-display text-3xl md:text-[2.6rem] font-black text-foreground leading-none tracking-tight mb-5">
          Transformation Plan
        </h2>

        {/* Duration selector */}
        <div className="mb-7">
          <DurationSelector
            selected={duration}
            onChange={setDuration}
            scope="premium"
          />
        </div>

        <PriceDisplay priceInfo={priceInfo} />

        <div
          className="mb-7"
          style={{ height: "1px", background: "oklch(0.72 0.19 45 / 0.2)" }}
        />

        <ul className="space-y-3.5 mb-6">
          <FeatureItem text={`${duration} Ideal Breakfast`} />
          <FeatureItem text={`${duration} Ideal Dinner`} />
          <FeatureItem text="Personal Coach" />
          <FeatureItem text="24×7 WhatsApp Support" />
          <FeatureItem text="Weekly Tracking & Detailed Progress Report" />
          <FeatureItem text="Weekly Counselling with Senior Coach" />
          <FeatureItem text="Live Exercise Classes" />
          <FeatureItem text="2 Nutrition Classes Weekly" />
          <FeatureItem text="Special Classes" />
          <FeatureItem text="Advanced Meal Planning & Diet Customisation" />
          <FeatureItem text="Mindset, Sleep & Recovery Coaching" />
          <FeatureItem text="Free Offline Event Ticket (Nearest Location)" />
          <FeatureItem text="Business Opportunity on Achieving Ideal Weight" />
          <FeatureItem text="20% Off Coupon for a Friend" />
        </ul>

        {duration === 20 && (
          <div
            className="mb-7 flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: "oklch(0.55 0.18 145 / 0.12)",
              border: "1.5px solid oklch(0.65 0.18 145 / 0.55)",
            }}
            data-ocid="pricing.premium.moneyback.panel"
          >
            <span className="text-xl flex-shrink-0">🛡️</span>
            <div>
              <p
                className="font-display text-[0.75rem] font-black tracking-[0.1em] uppercase leading-none mb-0.5"
                style={{ color: "oklch(0.72 0.18 145)" }}
              >
                30-Day Money Back Guarantee
              </p>
              <p
                className="font-sans text-[0.72rem] leading-snug"
                style={{ color: "oklch(0.65 0.08 145)" }}
              >
                Not satisfied? Get a full refund within 30 days — no questions
                asked.
              </p>
            </div>
          </div>
        )}

        <CtaButton
          ocid="pricing.premium.button"
          onClick={() =>
            onGetStarted(
              `Premium Plan - ${duration} Days`,
              priceInfo.finalPrice,
            )
          }
          shadow="0 4px 32px oklch(0.72 0.19 45 / 0.45)"
        />

        <div
          className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.19 45 / 0.09), transparent 70%)",
          }}
        />
      </GradientBorderCard>
    </motion.div>
  );
}

/* ─── Trust Badge ────────────────────────────────────────────────────────── */

function TrustBadge({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      className="flex items-center gap-2 font-sans text-[0.8rem]"
      style={{ color: "oklch(0.50 0 0)" }}
    >
      <span className="text-sm">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

/* ─── Nav Bar ─────────────────────────────────────────────────────────────── */

function NavBar({
  currentView,
  onNav,
}: { currentView: AppView; onNav: (v: AppView) => void }) {
  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
      style={{
        background: "oklch(0.10 0.008 285 / 0.95)",
        borderBottom: "1px solid oklch(0.20 0.008 285)",
        backdropFilter: "blur(12px)",
      }}
    >
      <button
        type="button"
        onClick={() => onNav("pricing")}
        data-ocid="nav.pricing.link"
        className="flex items-center gap-2 focus-visible:outline-none"
      >
        <span
          className="font-display font-black text-lg tracking-tight"
          style={{
            color: "oklch(0.72 0.19 45)",
            textShadow: "0 0 20px oklch(0.72 0.19 45 / 0.3)",
          }}
        >
          HN Coach
        </span>
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          data-ocid="nav.plans.tab"
          onClick={() => onNav("pricing")}
          className="px-4 py-2 rounded-lg font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            background:
              currentView === "pricing"
                ? "oklch(0.72 0.19 45 / 0.12)"
                : "transparent",
            color:
              currentView === "pricing"
                ? "oklch(0.72 0.19 45)"
                : "oklch(0.55 0 0)",
            border: `1px solid ${
              currentView === "pricing"
                ? "oklch(0.72 0.19 45 / 0.3)"
                : "transparent"
            }`,
          }}
        >
          Plans
        </button>
        <button
          type="button"
          data-ocid="nav.track.tab"
          onClick={() => onNav("track")}
          className="px-4 py-2 rounded-lg font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            background:
              currentView === "track"
                ? "oklch(0.72 0.19 45 / 0.12)"
                : "transparent",
            color:
              currentView === "track"
                ? "oklch(0.72 0.19 45)"
                : "oklch(0.55 0 0)",
            border: `1px solid ${
              currentView === "track"
                ? "oklch(0.72 0.19 45 / 0.3)"
                : "transparent"
            }`,
          }}
        >
          Track Membership
        </button>
      </div>
    </nav>
  );
}

/* ─── Membership Tracking Page ───────────────────────────────────────────── */

function MembershipTrackingPage({
  onNav,
  actor,
}: {
  onNav: (v: AppView) => void;
  actor: backendInterface | null;
}) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [member, setMember] = useState<Member | null | "not_found">(null);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setMember(null);
    try {
      if (!actor) {
        setMember("not_found");
        return;
      }
      const m = await actor.getMember(phone.trim());
      setMember(m ?? "not_found");
    } catch {
      setMember("not_found");
    } finally {
      setLoading(false);
    }
  }

  const foundMember = member !== null && member !== "not_found" ? member : null;
  const days = foundMember ? daysRemaining(foundMember.endDate) : 0;
  const totalDays = foundMember
    ? Math.round(
        Number(foundMember.endDate - foundMember.startDate) / Number(DAY_NS),
      )
    : 20;
  const progressPct = foundMember
    ? Math.max(0, Math.min(100, Math.round((1 - days / totalDays) * 100)))
    : 0;

  return (
    <main
      className="flex-1 flex flex-col items-center px-4 py-12 md:py-16"
      data-ocid="track.page"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center gap-2.5 mb-4">
          <span
            className="h-px w-8"
            style={{ background: "oklch(0.72 0.19 45 / 0.5)" }}
          />
          <span
            className="font-sans text-[0.65rem] font-bold tracking-[0.25em] uppercase"
            style={{ color: "oklch(0.72 0.19 45)" }}
          >
            Membership Portal
          </span>
          <span
            className="h-px w-8"
            style={{ background: "oklch(0.72 0.19 45 / 0.5)" }}
          />
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-black text-foreground tracking-tight mb-2">
          Track Your Membership
        </h1>
        <p className="font-sans text-sm" style={{ color: "oklch(0.60 0 0)" }}>
          Enter your WhatsApp number to view your plan status
        </p>
      </motion.div>

      {/* Search form */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md mb-8"
      >
        <div
          className="relative rounded-2xl p-px"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.72 0.19 45 / 0.35) 0%, oklch(0.25 0.010 285) 100%)",
          }}
        >
          <div
            className="rounded-2xl p-6"
            style={{ background: "oklch(0.13 0.010 285)" }}
          >
            <form onSubmit={handleTrack} className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label
                  className="font-sans text-sm font-semibold"
                  style={{ color: "oklch(0.80 0 0)" }}
                >
                  WhatsApp Number
                </Label>
                <Input
                  data-ocid="track.search_input"
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                data-ocid="track.submit_button"
                disabled={loading || !phone.trim()}
                className="w-full py-3 px-6 rounded-xl font-display text-[0.9rem] font-black tracking-[0.1em] uppercase flex items-center justify-center gap-2.5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: "oklch(0.72 0.19 45)",
                  color: "oklch(0.10 0 0)",
                  boxShadow: "0 4px 20px oklch(0.72 0.19 45 / 0.35)",
                }}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Clock size={16} />
                )}
                {loading ? "Looking up..." : "Track My Membership"}
              </button>
            </form>
          </div>
        </div>
      </motion.div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {member === "not_found" && (
          <motion.div
            key="not-found"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            data-ocid="track.error_state"
            className="w-full max-w-md"
          >
            <div
              className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
              style={{
                background: "oklch(0.13 0.010 285)",
                border: "1px solid oklch(0.28 0.008 285)",
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "oklch(0.20 0.010 285)" }}
              >
                <AlertCircle
                  size={22}
                  style={{ color: "oklch(0.72 0.22 25)" }}
                />
              </div>
              <div>
                <p className="font-display text-base font-black text-foreground mb-1">
                  No membership found
                </p>
                <p
                  className="font-sans text-sm"
                  style={{ color: "oklch(0.55 0 0)" }}
                >
                  We couldn't find a membership for that number.
                </p>
              </div>
              <button
                type="button"
                data-ocid="track.plans.link"
                onClick={() => onNav("pricing")}
                className="mt-1 flex items-center gap-1.5 font-sans text-sm font-semibold transition-colors hover:underline focus-visible:outline-none"
                style={{ color: "oklch(0.72 0.19 45)" }}
              >
                View our plans
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>
        )}

        {foundMember && (
          <motion.div
            key="found"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            data-ocid="track.success_state"
            className="w-full max-w-md space-y-4"
          >
            {/* Main membership card */}
            <div
              className="relative rounded-2xl p-px overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.72 0.19 45 / 0.7) 0%, oklch(0.72 0.19 45 / 0.2) 50%, oklch(0.25 0.010 285) 100%)",
              }}
            >
              <div
                className="rounded-2xl p-6 space-y-6"
                style={{ background: "oklch(0.12 0.010 285)" }}
              >
                {/* Member header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-black text-foreground leading-tight">
                      {foundMember.fullName}
                    </p>
                    <p
                      className="font-sans text-xs mt-0.5"
                      style={{ color: "oklch(0.55 0 0)" }}
                    >
                      {foundMember.whatsappNo}
                    </p>
                  </div>
                  <Badge
                    className="font-display text-[0.6rem] font-black tracking-wide uppercase px-2.5 py-1 shrink-0"
                    style={{
                      background:
                        days > 0
                          ? "oklch(0.72 0.19 45 / 0.15)"
                          : "oklch(0.25 0.010 285)",
                      border: `1px solid ${days > 0 ? "oklch(0.72 0.19 45 / 0.4)" : "oklch(0.35 0.008 285)"}`,
                      color:
                        days > 0 ? "oklch(0.72 0.19 45)" : "oklch(0.55 0 0)",
                    }}
                  >
                    {days > 0 ? "Active" : "Expired"}
                  </Badge>
                </div>

                {/* Countdown — big display */}
                <div className="text-center py-4">
                  <div
                    className="font-display font-black leading-none mb-1"
                    style={{
                      fontSize: "clamp(3.5rem, 14vw, 5rem)",
                      color:
                        days > 7
                          ? "oklch(0.72 0.19 45)"
                          : days > 0
                            ? "oklch(0.78 0.18 55)"
                            : "oklch(0.60 0.10 25)",
                      textShadow:
                        days > 0
                          ? "0 0 60px oklch(0.72 0.19 45 / 0.25)"
                          : "none",
                    }}
                  >
                    {days}
                  </div>
                  <p
                    className="font-sans text-sm font-semibold tracking-widest uppercase"
                    style={{ color: "oklch(0.55 0 0)" }}
                  >
                    {days === 1 ? "Day Remaining" : "Days Remaining"}
                  </p>

                  {/* Progress bar */}
                  <div className="mt-4 mx-auto max-w-[200px]">
                    <div
                      className="h-1.5 rounded-full overflow-hidden"
                      style={{ background: "oklch(0.20 0.008 285)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${progressPct}%`,
                          background:
                            progressPct > 80
                              ? "oklch(0.72 0.22 25)"
                              : "oklch(0.72 0.19 45)",
                        }}
                      />
                    </div>
                    <p
                      className="font-sans text-[0.65rem] mt-1.5"
                      style={{ color: "oklch(0.45 0 0)" }}
                    >
                      {progressPct}% used
                    </p>
                  </div>
                </div>

                {/* Details grid */}
                <div
                  className="grid grid-cols-2 gap-3"
                  style={{
                    borderTop: "1px solid oklch(0.22 0.008 285)",
                    paddingTop: "1.25rem",
                  }}
                >
                  <InfoTile
                    icon={<Target size={14} />}
                    label="Plan"
                    value={foundMember.plan}
                  />
                  <InfoTile
                    icon={<Target size={14} />}
                    label="Goal"
                    value={foundMember.goal}
                  />
                  <InfoTile
                    icon={<Calendar size={14} />}
                    label="End Date"
                    value={formatDate(foundMember.endDate)}
                  />
                  <InfoTile
                    icon={<RefreshCw size={14} />}
                    label="Renewal Date"
                    value={formatDate(foundMember.endDate)}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/* ─── InfoTile ───────────────────────────────────────────────────────────── */

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-xl p-3 space-y-1"
      style={{
        background: "oklch(0.16 0.010 285)",
        border: "1px solid oklch(0.25 0.008 285)",
      }}
    >
      <div
        className="flex items-center gap-1.5 font-sans text-[0.6rem] font-bold uppercase tracking-wider"
        style={{ color: "oklch(0.50 0 0)" }}
      >
        <span style={{ color: "oklch(0.72 0.19 45)" }}>{icon}</span>
        {label}
      </div>
      <p
        className="font-sans text-sm font-semibold leading-snug"
        style={{ color: "oklch(0.85 0 0)" }}
      >
        {value}
      </p>
    </div>
  );
}

/* ─── Admin Panel ─────────────────────────────────────────────────────────── */

interface AdminFormData {
  whatsappNo: string;
  fullName: string;
  age: string;
  height: string;
  weight: string;
  city: string;
  goal: string;
  plan: string;
  startDate: string;
  endDate: string;
}

const EMPTY_ADMIN_FORM: AdminFormData = {
  whatsappNo: "",
  fullName: "",
  age: "",
  height: "",
  weight: "",
  city: "",
  goal: "",
  plan: "Regular Plan - 20 Days",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
};

const PLAN_OPTIONS = [
  { value: "Regular Plan - 20 Days", label: "Regular Plan - 20 Days" },
  { value: "Regular Plan - 40 Days", label: "Regular Plan - 40 Days" },
  { value: "Regular Plan - 60 Days", label: "Regular Plan - 60 Days" },
  { value: "Premium Plan - 20 Days", label: "Premium Plan - 20 Days" },
  { value: "Premium Plan - 40 Days", label: "Premium Plan - 40 Days" },
  { value: "Premium Plan - 60 Days", label: "Premium Plan - 60 Days" },
];

const PLAN_DURATIONS: Record<string, number> = {
  "Regular Plan - 20 Days": 20,
  "Regular Plan - 40 Days": 40,
  "Regular Plan - 60 Days": 60,
  "Premium Plan - 20 Days": 20,
  "Premium Plan - 40 Days": 40,
  "Premium Plan - 60 Days": 60,
};

function AdminPanel({ actor }: { actor: backendInterface | null }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormData>(EMPTY_ADMIN_FORM);
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!actor) return;
    setLoadingMembers(true);
    try {
      const all = await actor.getAllMembers();
      setMembers(all);
    } catch {
      // silent
    } finally {
      setLoadingMembers(false);
    }
  }, [actor]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  function openAdd() {
    setAdminForm(EMPTY_ADMIN_FORM);
    setEditingMember(null);
    setModalMode("add");
  }

  function openEdit(m: Member) {
    setEditingMember(m);
    setAdminForm({
      whatsappNo: m.whatsappNo,
      fullName: m.fullName,
      age: m.age,
      height: m.height,
      weight: m.weight,
      city: m.city,
      goal: m.goal,
      plan: m.plan,
      startDate: nsToDateStr(m.startDate),
      endDate: nsToDateStr(m.endDate),
    });
    setModalMode("edit");
  }

  function handleAdminFormChange(field: keyof AdminFormData, value: string) {
    setAdminForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-recalculate endDate when plan or startDate changes
      if (field === "plan" || field === "startDate") {
        const planDays =
          PLAN_DURATIONS[field === "plan" ? value : next.plan] ?? 20;
        const start = new Date(field === "startDate" ? value : next.startDate);
        if (!Number.isNaN(start.getTime())) {
          const end = new Date(start.getTime() + planDays * 86_400_000);
          next.endDate = end.toISOString().slice(0, 10);
        }
      }
      return next;
    });
  }

  async function handleAdminSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const start = dateToNs(adminForm.startDate);
      const end = dateToNs(adminForm.endDate);
      if (!actor) return;
      if (modalMode === "add") {
        await actor.registerMember(
          adminForm.whatsappNo.trim(),
          adminForm.fullName.trim(),
          adminForm.age.trim(),
          adminForm.height.trim(),
          adminForm.weight.trim(),
          adminForm.city.trim(),
          adminForm.goal,
          adminForm.plan,
          start,
          end,
          "",
        );
      } else {
        await actor.updateMember(
          adminForm.whatsappNo.trim(),
          adminForm.fullName.trim(),
          adminForm.age.trim(),
          adminForm.height.trim(),
          adminForm.weight.trim(),
          adminForm.city.trim(),
          adminForm.goal,
          adminForm.plan,
          start,
          end,
        );
      }
      setModalMode(null);
      await loadMembers();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  const adminInputStyle: React.CSSProperties = {
    background: "oklch(0.17 0.010 285)",
    border: "1px solid oklch(0.28 0.010 285)",
    color: "oklch(0.95 0 0)",
    fontSize: "0.85rem",
  };

  return (
    <main
      className="flex-1 px-4 py-10 md:py-12 max-w-6xl mx-auto w-full"
      data-ocid="admin.page"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "oklch(0.72 0.19 45)" }}
            />
            <span
              className="font-sans text-[0.65rem] font-bold tracking-[0.22em] uppercase"
              style={{ color: "oklch(0.72 0.19 45)" }}
            >
              Admin Panel
            </span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-black text-foreground tracking-tight">
            Member Management
          </h1>
          <p
            className="font-sans text-sm mt-1"
            style={{ color: "oklch(0.55 0 0)" }}
          >
            {members.length} total members
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-ocid="admin.refresh.button"
            onClick={loadMembers}
            disabled={loadingMembers}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-sans text-sm font-semibold transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: "oklch(0.18 0.010 285)",
              border: "1px solid oklch(0.28 0.010 285)",
              color: "oklch(0.65 0 0)",
            }}
          >
            <RefreshCw
              size={14}
              className={loadingMembers ? "animate-spin" : ""}
            />
            Refresh
          </button>
          <button
            type="button"
            data-ocid="admin.add.open_modal_button"
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-display text-sm font-black tracking-[0.08em] uppercase transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: "oklch(0.72 0.19 45)",
              color: "oklch(0.10 0 0)",
              boxShadow: "0 4px 16px oklch(0.72 0.19 45 / 0.35)",
            }}
          >
            <UserPlus size={14} />
            Add Member
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: "1px solid oklch(0.25 0.008 285)",
          background: "oklch(0.12 0.010 285)",
        }}
      >
        {loadingMembers ? (
          <div
            data-ocid="admin.loading_state"
            className="flex items-center justify-center py-16 gap-3"
          >
            <Loader2
              size={20}
              className="animate-spin"
              style={{ color: "oklch(0.72 0.19 45)" }}
            />
            <span
              className="font-sans text-sm"
              style={{ color: "oklch(0.55 0 0)" }}
            >
              Loading members...
            </span>
          </div>
        ) : members.length === 0 ? (
          <div
            data-ocid="admin.empty_state"
            className="flex flex-col items-center justify-center py-16 gap-3 text-center"
          >
            <Users size={28} style={{ color: "oklch(0.35 0 0)" }} />
            <div>
              <p className="font-display font-black text-base text-foreground">
                No members yet
              </p>
              <p
                className="font-sans text-sm mt-0.5"
                style={{ color: "oklch(0.45 0 0)" }}
              >
                Add your first member to get started
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="w-full">
            <Table data-ocid="admin.table">
              <TableHeader>
                <TableRow
                  style={{
                    borderBottom: "1px solid oklch(0.22 0.008 285)",
                    background: "oklch(0.15 0.010 285)",
                  }}
                >
                  {[
                    "WhatsApp No",
                    "Full Name",
                    "Plan",
                    "Goal",
                    "Start",
                    "End",
                    "Days Left",
                    "Actions",
                  ].map((h) => (
                    <TableHead
                      key={h}
                      className="font-sans text-[0.65rem] font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "oklch(0.55 0 0)" }}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m, idx) => {
                  const left = daysRemaining(m.endDate);
                  return (
                    <TableRow
                      key={m.whatsappNo}
                      data-ocid={`admin.member.row.${idx + 1}`}
                      style={{
                        borderBottom: "1px solid oklch(0.18 0.008 285)",
                      }}
                      className="hover:bg-[oklch(0.16_0.010_285)] transition-colors duration-100"
                    >
                      <TableCell
                        className="font-sans text-xs font-semibold whitespace-nowrap"
                        style={{ color: "oklch(0.80 0 0)" }}
                      >
                        {m.whatsappNo}
                      </TableCell>
                      <TableCell
                        className="font-sans text-sm font-semibold whitespace-nowrap"
                        style={{ color: "oklch(0.92 0 0)" }}
                      >
                        {m.fullName}
                      </TableCell>
                      <TableCell
                        className="font-sans text-xs whitespace-nowrap"
                        style={{ color: "oklch(0.70 0 0)" }}
                      >
                        {m.plan}
                      </TableCell>
                      <TableCell
                        className="font-sans text-xs whitespace-nowrap"
                        style={{ color: "oklch(0.70 0 0)" }}
                      >
                        {m.goal}
                      </TableCell>
                      <TableCell
                        className="font-sans text-xs whitespace-nowrap"
                        style={{ color: "oklch(0.60 0 0)" }}
                      >
                        {formatDate(m.startDate)}
                      </TableCell>
                      <TableCell
                        className="font-sans text-xs whitespace-nowrap"
                        style={{ color: "oklch(0.60 0 0)" }}
                      >
                        {formatDate(m.endDate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full font-display text-[0.6rem] font-black"
                          style={{
                            background:
                              left > 7
                                ? "oklch(0.72 0.19 45 / 0.15)"
                                : left > 0
                                  ? "oklch(0.78 0.18 55 / 0.15)"
                                  : "oklch(0.25 0.010 285)",
                            color:
                              left > 7
                                ? "oklch(0.72 0.19 45)"
                                : left > 0
                                  ? "oklch(0.78 0.18 55)"
                                  : "oklch(0.55 0 0)",
                          }}
                        >
                          {left}d
                        </span>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          data-ocid={`admin.member.edit_button.${idx + 1}`}
                          onClick={() => openEdit(m)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-sans text-xs font-semibold transition-all duration-150 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{
                            background: "oklch(0.18 0.010 285)",
                            border: "1px solid oklch(0.28 0.010 285)",
                            color: "oklch(0.70 0 0)",
                          }}
                        >
                          <PenLine size={11} />
                          Edit
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog
        open={modalMode !== null}
        onOpenChange={(v) => !v && setModalMode(null)}
      >
        <DialogContent
          data-ocid={
            modalMode === "add" ? "admin.add.dialog" : "admin.edit.dialog"
          }
          className="max-w-lg w-full p-0 gap-0 border-0"
          style={{
            background: "oklch(0.12 0.010 285)",
            border: "1px solid oklch(0.28 0.012 285)",
            boxShadow: "0 24px 80px oklch(0.05 0.008 285 / 0.95)",
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle className="font-display text-xl font-black text-foreground">
              {modalMode === "add"
                ? "Add New Member"
                : `Edit — ${editingMember?.fullName}`}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] mt-4">
            <form
              id="admin-form"
              onSubmit={handleAdminSave}
              noValidate
              className="px-6 pb-6 space-y-4"
            >
              {/* WhatsApp No (locked on edit) */}
              <div className="space-y-1.5">
                <Label
                  className="font-sans text-sm font-semibold"
                  style={{ color: "oklch(0.80 0 0)" }}
                >
                  WhatsApp No{" "}
                  {modalMode === "edit" && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-sans text-[0.55rem] font-bold ml-1"
                      style={{
                        background: "oklch(0.20 0.008 285)",
                        color: "oklch(0.50 0 0)",
                      }}
                    >
                      <Lock size={8} /> locked
                    </span>
                  )}
                </Label>
                <Input
                  data-ocid="admin.form.whatsapp.input"
                  type="tel"
                  value={adminForm.whatsappNo}
                  onChange={(e) =>
                    modalMode === "add" &&
                    handleAdminFormChange("whatsappNo", e.target.value)
                  }
                  readOnly={modalMode === "edit"}
                  style={{
                    ...adminInputStyle,
                    opacity: modalMode === "edit" ? 0.6 : 1,
                  }}
                />
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <Label
                  className="font-sans text-sm font-semibold"
                  style={{ color: "oklch(0.80 0 0)" }}
                >
                  Full Name
                </Label>
                <Input
                  data-ocid="admin.form.fullname.input"
                  type="text"
                  value={adminForm.fullName}
                  onChange={(e) =>
                    handleAdminFormChange("fullName", e.target.value)
                  }
                  style={adminInputStyle}
                />
              </div>

              {/* Age + Height */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    className="font-sans text-sm font-semibold"
                    style={{ color: "oklch(0.80 0 0)" }}
                  >
                    Age
                  </Label>
                  <Input
                    data-ocid="admin.form.age.input"
                    type="number"
                    value={adminForm.age}
                    onChange={(e) =>
                      handleAdminFormChange("age", e.target.value)
                    }
                    style={adminInputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    className="font-sans text-sm font-semibold"
                    style={{ color: "oklch(0.80 0 0)" }}
                  >
                    Height
                  </Label>
                  <Input
                    data-ocid="admin.form.height.input"
                    type="text"
                    value={adminForm.height}
                    onChange={(e) =>
                      handleAdminFormChange("height", e.target.value)
                    }
                    style={adminInputStyle}
                  />
                </div>
              </div>

              {/* Weight + City */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    className="font-sans text-sm font-semibold"
                    style={{ color: "oklch(0.80 0 0)" }}
                  >
                    Weight
                  </Label>
                  <Input
                    data-ocid="admin.form.weight.input"
                    type="text"
                    value={adminForm.weight}
                    onChange={(e) =>
                      handleAdminFormChange("weight", e.target.value)
                    }
                    style={adminInputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    className="font-sans text-sm font-semibold"
                    style={{ color: "oklch(0.80 0 0)" }}
                  >
                    City
                  </Label>
                  <Input
                    data-ocid="admin.form.city.input"
                    type="text"
                    value={adminForm.city}
                    onChange={(e) =>
                      handleAdminFormChange("city", e.target.value)
                    }
                    style={adminInputStyle}
                  />
                </div>
              </div>

              {/* Goal */}
              <div className="space-y-1.5">
                <Label
                  className="font-sans text-sm font-semibold"
                  style={{ color: "oklch(0.80 0 0)" }}
                >
                  Goal
                </Label>
                <Select
                  value={adminForm.goal}
                  onValueChange={(v) => handleAdminFormChange("goal", v)}
                >
                  <SelectTrigger
                    data-ocid="admin.form.goal.select"
                    style={adminInputStyle}
                  >
                    <SelectValue placeholder="Select goal" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      background: "oklch(0.15 0.010 285)",
                      border: "1px solid oklch(0.28 0.008 285)",
                    }}
                  >
                    {GOALS.map((g) => (
                      <SelectItem
                        key={g}
                        value={g}
                        className="font-sans text-sm"
                        style={{ color: "oklch(0.85 0 0)" }}
                      >
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plan */}
              <div className="space-y-1.5">
                <Label
                  className="font-sans text-sm font-semibold"
                  style={{ color: "oklch(0.80 0 0)" }}
                >
                  Plan
                </Label>
                <Select
                  value={adminForm.plan}
                  onValueChange={(v) => handleAdminFormChange("plan", v)}
                >
                  <SelectTrigger
                    data-ocid="admin.form.plan.select"
                    style={adminInputStyle}
                  >
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      background: "oklch(0.15 0.010 285)",
                      border: "1px solid oklch(0.28 0.008 285)",
                    }}
                  >
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem
                        key={p.value}
                        value={p.value}
                        className="font-sans text-sm"
                        style={{ color: "oklch(0.85 0 0)" }}
                      >
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start + End dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    className="font-sans text-sm font-semibold"
                    style={{ color: "oklch(0.80 0 0)" }}
                  >
                    Start Date
                  </Label>
                  <Input
                    data-ocid="admin.form.startdate.input"
                    type="date"
                    value={adminForm.startDate}
                    onChange={(e) =>
                      handleAdminFormChange("startDate", e.target.value)
                    }
                    style={adminInputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    className="font-sans text-sm font-semibold"
                    style={{ color: "oklch(0.80 0 0)" }}
                  >
                    End Date
                  </Label>
                  <Input
                    data-ocid="admin.form.enddate.input"
                    type="date"
                    value={adminForm.endDate}
                    onChange={(e) =>
                      handleAdminFormChange("endDate", e.target.value)
                    }
                    style={adminInputStyle}
                  />
                </div>
              </div>
            </form>
          </ScrollArea>

          <div
            className="px-6 py-4 flex gap-3"
            style={{
              borderTop: "1px solid oklch(0.22 0.008 285)",
              background: "oklch(0.10 0.008 285)",
            }}
          >
            <button
              type="button"
              data-ocid="admin.form.cancel_button"
              onClick={() => setModalMode(null)}
              className="flex-none px-5 py-2.5 rounded-xl font-sans text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                background: "oklch(0.18 0.010 285)",
                border: "1px solid oklch(0.28 0.010 285)",
                color: "oklch(0.60 0 0)",
              }}
            >
              <X size={14} className="inline mr-1.5" />
              Cancel
            </button>
            <Button
              type="submit"
              form="admin-form"
              data-ocid="admin.form.save_button"
              disabled={saving}
              className="flex-1 font-display text-sm font-black tracking-[0.1em] uppercase"
              style={{
                background: "oklch(0.72 0.19 45)",
                color: "oklch(0.10 0 0)",
                boxShadow: "0 4px 16px oklch(0.72 0.19 45 / 0.35)",
              }}
            >
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              {saving
                ? "Saving..."
                : modalMode === "add"
                  ? "Add Member"
                  : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Coupon Codes Section ────────────────────────────────────────── */}
      <CouponSection actor={actor} />
    </main>
  );
}

/* ─── Coupon Section ─────────────────────────────────────────────────────── */

interface Coupon {
  code: string;
  createdAt: bigint;
  discountPct: bigint;
}

function CouponSection({ actor }: { actor: backendInterface | null }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const adminInputStyle: React.CSSProperties = {
    background: "oklch(0.17 0.010 285)",
    border: "1px solid oklch(0.28 0.010 285)",
    color: "oklch(0.95 0 0)",
    fontSize: "0.85rem",
  };

  const loadCoupons = useCallback(async () => {
    if (!actor) return;
    setLoadingCoupons(true);
    try {
      const all = await actor.getAllCoupons();
      setCoupons(all);
    } catch {
      // silent
    } finally {
      setLoadingCoupons(false);
    }
  }, [actor]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  async function handleAddCoupon(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    const code = newCode.trim().toUpperCase();
    const pct = Number(newDiscount);
    if (!code) {
      setAddError("Code is required");
      return;
    }
    if (!pct || pct < 1 || pct > 100) {
      setAddError("Discount must be 1–100%");
      return;
    }
    setAdding(true);
    try {
      await actor?.addCoupon(code, BigInt(pct));
      setNewCode("");
      setNewDiscount("");
      await loadCoupons();
    } catch {
      setAddError("Failed to add coupon");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(code: string) {
    setDeletingCode(code);
    try {
      await actor?.deleteCoupon(code);
      await loadCoupons();
    } catch {
      // silent
    } finally {
      setDeletingCode(null);
    }
  }

  return (
    <section className="mt-12" data-ocid="admin.coupons.section">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "oklch(0.72 0.19 45)" }}
            />
            <span
              className="font-sans text-[0.65rem] font-bold tracking-[0.22em] uppercase"
              style={{ color: "oklch(0.72 0.19 45)" }}
            >
              Discounts
            </span>
          </div>
          <h2 className="font-display text-xl font-black text-foreground tracking-tight">
            Coupon Codes
          </h2>
          <p
            className="font-sans text-sm mt-0.5"
            style={{ color: "oklch(0.55 0 0)" }}
          >
            {coupons.length} active{" "}
            {coupons.length === 1 ? "coupon" : "coupons"}
          </p>
        </div>
        <button
          type="button"
          data-ocid="admin.coupons.refresh.button"
          onClick={loadCoupons}
          disabled={loadingCoupons}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-sans text-sm font-semibold transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50"
          style={{
            background: "oklch(0.18 0.010 285)",
            border: "1px solid oklch(0.28 0.010 285)",
            color: "oklch(0.65 0 0)",
          }}
        >
          <RefreshCw
            size={14}
            className={loadingCoupons ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {/* Add coupon form */}
      <form
        onSubmit={handleAddCoupon}
        className="rounded-2xl p-5 mb-5 flex flex-col sm:flex-row gap-3 items-end"
        style={{
          background: "oklch(0.12 0.010 285)",
          border: "1px solid oklch(0.25 0.008 285)",
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label
            className="font-sans text-xs font-semibold uppercase tracking-wider"
            style={{ color: "oklch(0.55 0 0)" }}
          >
            Coupon Code
          </Label>
          <Input
            data-ocid="admin.coupon.code.input"
            type="text"
            placeholder="e.g. SAVE20"
            value={newCode}
            onChange={(e) => {
              setNewCode(e.target.value.toUpperCase());
              setAddError("");
            }}
            style={adminInputStyle}
          />
        </div>
        <div className="w-32 space-y-1.5">
          <Label
            className="font-sans text-xs font-semibold uppercase tracking-wider"
            style={{ color: "oklch(0.55 0 0)" }}
          >
            Discount %
          </Label>
          <Input
            data-ocid="admin.coupon.discount.input"
            type="number"
            min="1"
            max="100"
            placeholder="e.g. 15"
            value={newDiscount}
            onChange={(e) => {
              setNewDiscount(e.target.value);
              setAddError("");
            }}
            style={adminInputStyle}
          />
        </div>
        <button
          type="submit"
          data-ocid="admin.coupon.add.button"
          disabled={adding}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-display text-sm font-black tracking-[0.08em] uppercase transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap"
          style={{
            background: "oklch(0.72 0.19 45)",
            color: "oklch(0.10 0 0)",
            boxShadow: "0 4px 16px oklch(0.72 0.19 45 / 0.35)",
          }}
        >
          {adding ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Add Coupon
        </button>
        {addError && (
          <p
            className="font-sans text-xs sm:absolute sm:mt-0 mt-1"
            style={{ color: "oklch(0.65 0.22 25)" }}
          >
            {addError}
          </p>
        )}
      </form>

      {/* Coupon list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          border: "1px solid oklch(0.25 0.008 285)",
          background: "oklch(0.12 0.010 285)",
        }}
      >
        {loadingCoupons ? (
          <div
            data-ocid="admin.coupons.loading_state"
            className="flex items-center justify-center py-10 gap-3"
          >
            <Loader2
              size={18}
              className="animate-spin"
              style={{ color: "oklch(0.72 0.19 45)" }}
            />
            <span
              className="font-sans text-sm"
              style={{ color: "oklch(0.55 0 0)" }}
            >
              Loading coupons...
            </span>
          </div>
        ) : coupons.length === 0 ? (
          <div
            data-ocid="admin.coupons.empty_state"
            className="flex flex-col items-center justify-center py-10 gap-2 text-center"
          >
            <Tag size={24} style={{ color: "oklch(0.35 0 0)" }} />
            <p className="font-display font-black text-sm text-foreground">
              No coupons yet
            </p>
            <p
              className="font-sans text-xs"
              style={{ color: "oklch(0.45 0 0)" }}
            >
              Add your first coupon code above
            </p>
          </div>
        ) : (
          <Table data-ocid="admin.coupons.table">
            <TableHeader>
              <TableRow
                style={{
                  borderBottom: "1px solid oklch(0.22 0.008 285)",
                  background: "oklch(0.15 0.010 285)",
                }}
              >
                {["Code", "Discount", "Created", ""].map((h) => (
                  <TableHead
                    key={h}
                    className="font-sans text-[0.65rem] font-bold uppercase tracking-wider"
                    style={{ color: "oklch(0.55 0 0)" }}
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((c, idx) => (
                <TableRow
                  key={c.code}
                  data-ocid={`admin.coupons.item.${idx + 1}`}
                  style={{ borderBottom: "1px solid oklch(0.18 0.008 285)" }}
                  className="hover:bg-[oklch(0.15_0.010_285/0.5)] transition-colors"
                >
                  <TableCell
                    className="font-mono text-sm font-bold"
                    style={{ color: "oklch(0.72 0.19 45)" }}
                  >
                    {c.code}
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-xs font-bold"
                      style={{
                        background: "oklch(0.72 0.19 45 / 0.15)",
                        color: "oklch(0.72 0.19 45)",
                      }}
                    >
                      {String(c.discountPct)}% OFF
                    </span>
                  </TableCell>
                  <TableCell
                    className="font-sans text-xs"
                    style={{ color: "oklch(0.55 0 0)" }}
                  >
                    {new Date(
                      Number(c.createdAt / 1_000_000n),
                    ).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      data-ocid={`admin.coupons.delete_button.${idx + 1}`}
                      onClick={() => handleDelete(c.code)}
                      disabled={deletingCode === c.code}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-sans text-xs font-semibold transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50"
                      style={{
                        background: "oklch(0.65 0.22 25 / 0.12)",
                        border: "1px solid oklch(0.65 0.22 25 / 0.35)",
                        color: "oklch(0.65 0.22 25)",
                      }}
                    >
                      {deletingCode === c.code ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Trash2 size={11} />
                      )}
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

/* ─── Pricing Page ───────────────────────────────────────────────────────── */

function PricingPage({
  onGetStarted,
}: {
  onGetStarted: (planLabel: string, planPrice: number) => void;
}) {
  const [plan, setPlan] = useState<PlanView>("regular");

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-16 md:py-20">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="text-center mb-12 md:mb-14"
      >
        <div className="inline-flex items-center gap-2.5 mb-6">
          <span
            className="h-px w-10"
            style={{ background: "oklch(0.72 0.19 45 / 0.5)" }}
          />
          <span
            className="font-sans text-[0.65rem] font-bold tracking-[0.25em] uppercase"
            style={{ color: "oklch(0.72 0.19 45)" }}
          >
            Transformation Plan
          </span>
          <span
            className="h-px w-10"
            style={{ background: "oklch(0.72 0.19 45 / 0.5)" }}
          />
        </div>

        <div className="flex flex-col items-center gap-0 mb-2">
          <span
            className="font-display font-light tracking-[0.35em] uppercase leading-none"
            style={{
              fontSize: "clamp(0.95rem, 3vw, 1.25rem)",
              color: "oklch(0.65 0 0)",
              letterSpacing: "0.4em",
            }}
          >
            H&nbsp;N
          </span>
          <h1
            className="font-display font-black leading-none tracking-tight uppercase"
            style={{
              fontSize: "clamp(5rem, 20vw, 9rem)",
              color: "oklch(0.72 0.19 45)",
              textShadow:
                "0 0 80px oklch(0.72 0.19 45 / 0.3), 0 0 160px oklch(0.72 0.19 45 / 0.12)",
              lineHeight: 0.88,
            }}
          >
            Coach
          </h1>
        </div>

        <div className="flex items-center justify-center gap-3 mt-4 mb-5">
          <div
            className="h-px flex-1 max-w-[80px]"
            style={{ background: "oklch(0.72 0.19 45 / 0.25)" }}
          />
          <span
            className="font-sans text-xs font-medium tracking-widest uppercase"
            style={{ color: "oklch(0.55 0 0)" }}
          >
            ✦
          </span>
          <div
            className="h-px flex-1 max-w-[80px]"
            style={{ background: "oklch(0.72 0.19 45 / 0.25)" }}
          />
        </div>

        <p
          className="font-sans text-[0.95rem] md:text-base max-w-xs mx-auto leading-relaxed"
          style={{ color: "oklch(0.72 0 0)" }}
        >
          Choose your plan and start your transformation today
        </p>
      </motion.div>

      {/* Toggle */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="mb-12 md:mb-14"
      >
        <div
          data-ocid="pricing.toggle"
          role="tablist"
          aria-label="Pricing plan view"
          className="relative inline-flex items-center rounded-full p-1.5"
          style={{
            background: "oklch(0.15 0.010 285)",
            border: "1px solid oklch(0.28 0.010 285)",
            boxShadow: "inset 0 1px 3px oklch(0.05 0.008 285 / 0.6)",
          }}
        >
          <button
            type="button"
            data-ocid="pricing.regular.tab"
            role="tab"
            aria-selected={plan === "regular"}
            onClick={() => setPlan("regular")}
            className="relative z-10 px-7 py-2.5 rounded-full font-display text-[0.8rem] font-black tracking-[0.1em] uppercase transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            style={{
              color: plan === "regular" ? "oklch(0.10 0 0)" : "oklch(0.55 0 0)",
            }}
          >
            {plan === "regular" && (
              <motion.span
                layoutId="toggle-active-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: "oklch(0.72 0.19 45)" }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">Regular</span>
          </button>

          <button
            type="button"
            data-ocid="pricing.premium.tab"
            role="tab"
            aria-selected={plan === "premium"}
            onClick={() => setPlan("premium")}
            className="relative z-10 px-7 py-2.5 rounded-full font-display text-[0.8rem] font-black tracking-[0.1em] uppercase transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            style={{
              color: plan === "premium" ? "oklch(0.10 0 0)" : "oklch(0.55 0 0)",
            }}
          >
            {plan === "premium" && (
              <motion.span
                layoutId="toggle-active-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: "oklch(0.72 0.19 45)" }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">Premium</span>
          </button>
        </div>
      </motion.div>

      {/* Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg"
      >
        <AnimatePresence mode="wait">
          {plan === "regular" ? (
            <RegularPlanCard onGetStarted={onGetStarted} />
          ) : (
            <PremiumPlanCard onGetStarted={onGetStarted} />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Trust strip */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.48 }}
        className="mt-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-7"
      >
        <TrustBadge icon="🔒" text="Secure payment" />
        <span
          className="hidden sm:block w-px h-3.5"
          style={{ background: "oklch(0.30 0 0)" }}
        />
        <TrustBadge icon="📅" text="Flexible scheduling" />
        <span
          className="hidden sm:block w-px h-3.5"
          style={{ background: "oklch(0.30 0 0)" }}
        />
        <TrustBadge icon="🏋️" text="Expert coaches" />
      </motion.div>
    </main>
  );
}

/* ─── Main App ───────────────────────────────────────────────────────────── */

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const isAdmin = params.get("admin") === "1";
  const viewParam = params.get("view");

  const { actor } = useActor();

  const getInitialView = (): AppView => {
    if (isAdmin) return "admin";
    if (viewParam === "track") return "track";
    return "pricing";
  };

  const [currentView, setCurrentView] = useState<AppView>(getInitialView);
  const [modalOpen, setModalOpen] = useState(false);
  const [activePlanName, setActivePlanName] = useState("");
  const [activePlanPrice, setActivePlanPrice] = useState(0);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordError, setAdminPasswordError] = useState(false);

  function navigate(view: AppView) {
    setCurrentView(view);
    const url = new URL(window.location.href);
    if (view === "track") {
      url.searchParams.set("view", "track");
      url.searchParams.delete("admin");
    } else if (view === "admin") {
      url.searchParams.set("admin", "1");
      url.searchParams.delete("view");
    } else {
      url.searchParams.delete("view");
      url.searchParams.delete("admin");
    }
    window.history.pushState({}, "", url.toString());
  }

  function openModal(planLabel: string, planPrice: number) {
    setActivePlanName(planLabel);
    setActivePlanPrice(planPrice);
    setModalOpen(true);
  }

  useRazorpayScript();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background ambient shapes */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.19 45 / 0.05) 0%, transparent 65%)",
          }}
        />
        <div
          className="absolute -bottom-60 -left-40 w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.19 45 / 0.035) 0%, transparent 65%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(oklch(0.97 0 0 / 0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Nav — hidden on admin */}
      {!isAdmin && <NavBar currentView={currentView} onNav={navigate} />}

      {/* Views */}
      <AnimatePresence mode="wait">
        {currentView === "pricing" && (
          <motion.div
            key="pricing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            <PricingPage onGetStarted={openModal} />
          </motion.div>
        )}

        {currentView === "track" && (
          <motion.div
            key="track"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            <MembershipTrackingPage onNav={navigate} actor={actor} />
          </motion.div>
        )}

        {currentView === "admin" && !adminUnlocked && (
          <motion.div
            key="admin-gate"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex items-center justify-center px-4 py-16"
          >
            <div
              className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5"
              style={{
                background: "oklch(0.13 0.008 285)",
                border: "1px solid oklch(0.22 0.008 285)",
              }}
            >
              <div className="text-center mb-2">
                <h1
                  className="font-display font-black text-2xl"
                  style={{ color: "oklch(0.97 0 0)" }}
                >
                  Admin Panel
                </h1>
                <p
                  className="text-sm mt-1"
                  style={{ color: "oklch(0.55 0.008 285)" }}
                >
                  Enter password to continue
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (adminPassword === "hncoach2024") {
                    setAdminUnlocked(true);
                    setAdminPasswordError(false);
                  } else {
                    setAdminPasswordError(true);
                  }
                }}
                className="flex flex-col gap-3"
              >
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setAdminPasswordError(false);
                  }}
                  placeholder="Password"
                  data-ocid="admin.password.input"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 transition-all"
                  style={{
                    background: "oklch(0.18 0.008 285)",
                    border: adminPasswordError
                      ? "1px solid oklch(0.65 0.2 30)"
                      : "1px solid oklch(0.28 0.008 285)",
                    color: "oklch(0.97 0 0)",
                  }}
                />
                {adminPasswordError && (
                  <p
                    data-ocid="admin.password.error_state"
                    className="text-sm text-center"
                    style={{ color: "oklch(0.65 0.2 30)" }}
                  >
                    Incorrect password
                  </p>
                )}
                <button
                  type="submit"
                  data-ocid="admin.password.submit_button"
                  className="w-full rounded-xl py-3 font-display font-bold text-sm transition-all hover:opacity-90 active:scale-95"
                  style={{
                    background: "oklch(0.72 0.19 45)",
                    color: "oklch(0.10 0 0)",
                  }}
                >
                  Login
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {currentView === "admin" && adminUnlocked && (
          <motion.div
            key="admin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            <AdminPanel actor={actor} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer
        className="relative py-6 px-4 text-center"
        style={{ borderTop: "1px solid oklch(0.20 0.008 285)" }}
      >
        {/* Highlighted Note */}
        <div
          className="max-w-lg mx-auto mb-5 px-4 py-3 rounded-xl flex items-start gap-2.5"
          style={{
            background: "oklch(0.72 0.19 45 / 0.12)",
            border: "1px solid oklch(0.72 0.19 45 / 0.45)",
          }}
          data-ocid="footer.note.panel"
        >
          <span
            className="mt-0.5 flex-shrink-0 font-display font-black text-sm"
            style={{ color: "oklch(0.72 0.19 45)" }}
          >
            ⚠
          </span>
          <p
            className="font-sans text-sm text-left leading-snug"
            style={{ color: "oklch(0.88 0 0)" }}
          >
            <span
              className="font-bold"
              style={{ color: "oklch(0.72 0.19 45)" }}
            >
              Note —
            </span>{" "}
            If you face any problem on this website, take a screenshot and send
            it to the person who sent you the link.
          </p>
        </div>
      </footer>

      {/* Intake Form Modal */}
      <IntakeFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        planName={activePlanName}
        planPrice={activePlanPrice}
        actor={actor}
      />
    </div>
  );
}
