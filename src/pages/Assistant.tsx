import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Navigate } from "react-router";
import ReactMarkdown from "react-markdown";
import { BookOpenCheck, ExternalLink, LoaderCircle, MessageSquareText, Send, ShieldAlert, Sparkles, Stethoscope, UserRound } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/providers/trpc";
import { useCare } from "@/components/care/CareProvider";
import { EmptyState, LoadingState, PageHeader } from "@/components/care/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDayTime } from "@/lib/care-utils";
import type { AppRouter } from "../../api/router";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Evidence = RouterOutputs["assistant"]["evidence"][number];
type ChatMessage = RouterOutputs["assistant"]["history"][number];

const prompts = [
  "Summarize the confirmed record trends and list questions for our next doctor visit.",
  "What general nutrition topics from the supplied research should we discuss with the treating clinician?",
  "How can we present recent symptoms, meal estimates, blood pressure, and medication confirmations clearly to the doctor?",
  "What additional records would help the clinician review this care plan safely?",
];

function messageSources(message: ChatMessage): Evidence[] {
  if (!Array.isArray(message.sources)) return [];
  return message.sources.filter((source): source is Evidence => (
    typeof source === "object" && source !== null &&
    "id" in source && typeof source.id === "number" &&
    "title" in source && typeof source.title === "string" &&
    "url" in source && typeof source.url === "string"
  ));
}

function MessageBody({ message }: { message: ChatMessage }) {
  const sources = messageSources(message);
  const markdown = message.body.replace(/\[(\d+)\]/g, (citation, id: string) => {
    const source = sources.find((item) => item.id === Number(id));
    return source ? `[[${id}]](<${source.url}>)` : citation;
  });
  return (
    <div>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="my-3 text-base leading-relaxed text-foreground/85 first:mt-0 last:mb-0">{children}</p>,
          h1: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h4 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h4>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 text-base leading-relaxed">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-5 text-base leading-relaxed">{children}</ol>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="rounded font-semibold text-primary underline decoration-primary/40 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</a>,
        }}
      >
        {markdown}
      </ReactMarkdown>
      {sources.length ? (
        <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-3">
          {sources.map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary/20 px-3 text-xs font-semibold text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Source {source.id} <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Assistant() {
  const { patient, role } = useCare();
  const patientId = patient!.id;
  const utils = trpc.useUtils();
  const history = trpc.assistant.history.useQuery({ patientId }, { enabled: role === "caregiver" });
  const evidence = trpc.assistant.evidence.useQuery(undefined, { enabled: role === "caregiver" });
  const [question, setQuestion] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const ask = trpc.assistant.ask.useMutation({
    onSuccess: async () => {
      setQuestion("");
      await utils.assistant.history.invalidate({ patientId });
    },
  });

  useEffect(() => {
    const container = conversationRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [history.data?.length, ask.isPending]);

  if (role === "parent") return <Navigate to="/today" replace />;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const clean = question.trim();
    if (clean.length < 2 || ask.isPending) return;
    ask.mutate({ patientId, question: clean });
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div>
      <PageHeader
        title="Doctor-preparation assistant"
        description={`A cited research conversation about ${patient!.name}’s confirmed care records. It helps the family prepare questions; licensed clinicians remain responsible for diagnosis, prescriptions, and treatment decisions.`}
      />

      <div className="mb-6 flex gap-3 rounded-xl border border-[#a14b43]/20 bg-[#f8e4df] p-4 text-sm leading-relaxed text-[#683832]">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p><strong>Not an emergency service or autonomous doctor.</strong> Severe, sudden, or worsening symptoms need the existing urgent-care plan or local emergency services. Never start, stop, skip, double, or change a medicine, dose, supplement, diet, or treatment from this conversation.</p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <section className="surface min-w-0 overflow-hidden" aria-label="Research conversation">
          <div className="border-b border-foreground/12 bg-secondary/45 px-5 py-4">
            <div className="flex items-center gap-3">
              <Stethoscope className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Clinical conversation workspace</h2>
                <p className="text-xs text-foreground/60">Confirmed records and supplied peer-reviewed sources only</p>
              </div>
            </div>
          </div>

          <div ref={conversationRef} className="max-h-[68vh] min-h-80 overflow-y-auto p-4 sm:p-6" aria-live="polite">
            {history.isLoading ? <LoadingState label="Loading the saved conversation…" /> : null}
            {!history.isLoading && !history.data?.length ? (
              <EmptyState
                title="Prepare a better doctor conversation"
                description="Ask for a cautious record summary, general evidence topics, or a question list. Answers are saved for caregivers connected to this profile."
              />
            ) : null}
            <div className="space-y-5">
              {history.data?.map((message) => (
                <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" ? <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Sparkles className="h-4 w-4" aria-hidden="true" /></div> : null}
                  <div className={`min-w-0 max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[85%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "border border-foreground/12 bg-card"}`}>
                    <div className={`mb-2 flex items-center gap-2 text-xs ${message.role === "user" ? "text-primary-foreground/80" : "text-foreground/55"}`}>
                      {message.role === "user" ? <UserRound className="h-3.5 w-3.5" aria-hidden="true" /> : <BookOpenCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>{message.role === "user" ? "Caregiver" : "Research assistant"} · {formatDayTime(message.createdAt)}</span>
                    </div>
                    {message.role === "user" ? <p className="whitespace-pre-wrap text-base leading-relaxed">{message.body}</p> : <MessageBody message={message} />}
                  </div>
                </article>
              ))}
              {ask.isPending ? (
                <div className="flex items-center gap-3 rounded-2xl border border-foreground/12 bg-secondary/35 p-4 text-sm text-foreground/70" role="status">
                  <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                  Reviewing confirmed records and the selected research sources…
                </div>
              ) : null}
              {ask.isError ? (
                <div className="rounded-xl border border-[#a14b43]/25 bg-[#f8e4df] p-4 text-sm leading-relaxed text-[#683832]" role="alert">
                  {ask.error.message} Your question is still in the composer so you can retry or copy it for the clinical visit.
                </div>
              ) : null}
            </div>

          </div>

          <div className="border-t border-foreground/12 p-4 sm:p-5">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Suggested questions">
              {prompts.map((prompt, index) => (
                <button key={prompt} type="button" onClick={() => setQuestion(prompt)} className="min-h-11 shrink-0 rounded-full border border-foreground/15 bg-card px-4 text-left text-xs font-medium text-foreground/70 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {index === 0 ? "Visit summary" : index === 1 ? "Nutrition evidence" : index === 2 ? "Organize updates" : "Missing records"}
                </button>
              ))}
            </div>
            <form onSubmit={submit}>
              <label htmlFor="assistant-question" className="mb-2 block text-sm font-semibold">Question for doctor preparation</label>
              <Textarea
                id="assistant-question"
                rows={4}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={composerKeyDown}
                maxLength={4000}
                disabled={ask.isPending}
                placeholder="Example: Summarize the confirmed blood-pressure and meal-record trends, then suggest questions for our clinician."
                className="min-h-28 resize-y text-base"
              />
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-foreground/55">Research citations link only to the displayed library. Record summaries are not research citations. Ctrl/⌘ + Enter to send.</p>
                <Button type="submit" size="lg" className="min-h-12 shrink-0" disabled={ask.isPending || question.trim().length < 2}>
                  <Send className="h-4 w-4" /> {ask.isPending ? "Preparing…" : "Ask with records"}
                </Button>
              </div>
            </form>
          </div>
        </section>

        <aside className="surface-pad min-w-0" aria-labelledby="evidence-title">
          <div className="mb-5">
            <p className="care-label">Bounded source library</p>
            <h2 id="evidence-title" className="mt-1 text-xl font-semibold">Peer-reviewed evidence</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/60">These are the only sources available for research claims in this workspace. General study findings do not establish individual benefit or a treatment plan.</p>
          </div>
          {evidence.isLoading ? <LoadingState label="Loading evidence…" /> : null}
          <div className="space-y-5">
            {evidence.data?.map((source) => (
              <article key={source.id} className="border-t border-foreground/12 pt-4 first:border-t-0 first:pt-0">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">{source.id}</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-relaxed">{source.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-foreground/55">{source.authors} · {source.publication} · {source.year}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground/65">{source.summary}</p>
                <a href={source.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded text-sm font-semibold text-primary underline decoration-primary/35 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Open publication <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
          <div className="mt-6 flex gap-3 border-t border-foreground/12 pt-5 text-xs leading-relaxed text-foreground/60">
            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p>Raw DNA files and variants are not sent into this conversation. Genetic findings require validated interpretation and clinician or genetics-specialist review.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
