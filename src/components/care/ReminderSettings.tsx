import { useState } from "react";
import { BellRing, CheckCircle2, Send, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useCare } from "./CareProvider";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/care-utils";

function base64UrlToBytes(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function bytesToBase64(value: ArrayBuffer | null) {
  if (!value) return "";
  const bytes = new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary);
}

function bytesToBase64Url(value: ArrayBuffer | null) {
  if (!value) return "";
  return bytesToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A blocked notification prompt can never resolve in some browsers (observed on
// iOS after the user once declined). Time-box it so the button always resolves.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

const PERMISSION_TIMEOUT_MS = 15_000;
const SUBSCRIBE_TIMEOUT_MS = 20_000;
const BLOCKED_MESSAGE = "Reminders are blocked on this device. Open the iPhone Settings app, tap Notifications, then Care Companion (or Safari), and allow notifications. Then try again here.";

export function ReminderSettings() {
  const { patient } = useCare();
  const patientId = patient!.id;
  const utils = trpc.useUtils();
  const status = trpc.notifications.status.useQuery({ patientId });
  const deliveries = trpc.notifications.deliveries.useQuery({ patientId });
  const [busy, setBusy] = useState(false);
  const invalidate = async () => Promise.all([
    utils.notifications.status.invalidate(),
    utils.notifications.deliveries.invalidate(),
  ]);
  const subscribe = trpc.notifications.subscribe.useMutation({ onError: (error) => toast.error(error.message) });
  const unsubscribe = trpc.notifications.unsubscribe.useMutation({ onError: (error) => toast.error(error.message) });
  const sendTest = trpc.notifications.sendTest.useMutation({
    onSuccess: async (result) => {
      toast.success("Test accepted by the push service", { description: `${result.sent} device${result.sent === 1 ? "" : "s"} accepted it. Check the phone screen; acceptance is not proof of display or acknowledgement.` });
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  async function enable() {
    setBusy(true);
    try {
      if (!status.data?.configured || !status.data.publicKey) throw new Error("The reminder service is not configured.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error(isIos && !installed
          ? "On iPhone, open Care Companion in Safari and choose Share → Add to Home Screen. Open that Home Screen icon, then enable reminders."
          : "This browser does not support Web Push reminders.");
      }
      if (Notification.permission === "denied") throw new Error(BLOCKED_MESSAGE);
      const permission = await withTimeout(
        Notification.requestPermission(),
        PERMISSION_TIMEOUT_MS,
        BLOCKED_MESSAGE,
      );
      if (permission !== "granted") throw new Error("Notifications were not allowed. You can change this in the browser or iPhone notification settings.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      // Drop any subscription created with a previous VAPID key: reusing it
      // would make every future send fail until the key pair is restored.
      const subKey = (subscription as PushSubscription & { applicationServerKey?: ArrayBuffer | null }).applicationServerKey;
      const staleKey = subscription && bytesToBase64Url(subKey ?? null) !== status.data.publicKey;
      if (staleKey) {
        await subscription!.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(status.data.publicKey),
          }),
          SUBSCRIBE_TIMEOUT_MS,
          "The phone did not finish connecting to the reminder service. Check your connection and try again.",
        );
      }
      await subscribe.mutateAsync({
        patientId,
        endpoint: subscription.endpoint,
        p256dh: bytesToBase64(subscription.getKey("p256dh")),
        auth: bytesToBase64(subscription.getKey("auth")),
        userAgent: navigator.userAgent,
      });
      await invalidate();
      toast.success("This device is connected", { description: "Send a test and keep a backup alarm for time-critical medicines." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable reminders.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribe.mutateAsync({ patientId, endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      await invalidate();
      toast.success("This device was disconnected from reminders");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="reminders" className="surface-pad mb-6 scroll-mt-24" aria-labelledby="reminder-title">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" /><h2 id="reminder-title" className="text-xl font-semibold tracking-tight">iPhone & device reminders</h2></div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">Reminders use Web Push and the care-profile timezone ({status.data?.timezone ?? "loading…"}). They are not exact medical alarms and are not an emergency-monitoring service.</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/65">On iPhone: open in Safari → Share → Add to Home Screen → open the installed icon → enable reminders. Also allow Care Companion in iPhone Notification settings and review Focus/Do Not Disturb.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-primary" />{status.data?.subscriptionCount ?? 0} connected device{status.data?.subscriptionCount === 1 ? "" : "s"}</span>
            {status.data?.subscribedHere ? <span className="inline-flex items-center gap-1.5 text-primary"><CheckCircle2 className="h-4 w-4" />This account has a subscription</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Button className="min-h-12" disabled={busy || status.isLoading} onClick={enable}><BellRing className="h-4 w-4" />{busy ? "Working…" : "Enable on this device"}</Button>
          <Button variant="outline" className="min-h-12" disabled={!status.data?.subscriptionCount || sendTest.isPending} onClick={() => sendTest.mutate({ patientId })}><Send className="h-4 w-4" />{sendTest.isPending ? "Sending…" : "Send real test"}</Button>
          {status.data?.subscribedHere ? <Button variant="ghost" disabled={busy} onClick={disable}><XCircle className="h-4 w-4" />Disconnect</Button> : null}
        </div>
      </div>
      {deliveries.data?.length ? <details className="mt-5 border-t border-foreground/10 pt-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Recent reminder delivery attempts</summary><div className="mt-3 grid gap-2">{deliveries.data.map((delivery) => <div key={delivery.id} className="grid gap-1 rounded-lg bg-secondary/60 p-3 text-sm sm:grid-cols-[130px_1fr]"><span className="font-semibold capitalize">{delivery.status.replaceAll("_", " ")}</span><span>{delivery.day} {delivery.slot} · {delivery.detail} <span className="text-foreground/55">({formatDayTime(delivery.attemptedAt)})</span></span></div>)}</div></details> : null}
      <p className="mt-4 text-xs leading-relaxed text-foreground/55">Push-service acceptance does not confirm display, hearing, reading, or medication intake. Keep the prescriber’s routine and a backup alarm for time-critical medication.</p>
    </section>
  );
}
