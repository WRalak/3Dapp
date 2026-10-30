"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-controls";
import { useAction } from "@/hooks/use-action";
import { replyInquiryAction } from "@/features/marketplace/actions";
import { cn, formatDate } from "@/lib/utils";

export function InquiryThread({
  inquiryId,
  meId,
  messages,
  closed,
}: {
  inquiryId: string;
  meId: string;
  messages: { id: string; body: string; createdAt: string | Date; author: { id: string; name: string | null } }[];
  closed: boolean;
}) {
  const [text, setText] = useState("");
  const { pending, run } = useAction();
  return (
    <div className="space-y-6">
      <ol className="space-y-3">
        {messages.map((m) => {
          const mine = m.author.id === meId;
          return (
            <li key={m.id} className={cn("max-w-[85%] p-3 text-sm", mine ? "ml-auto bg-ink text-ivory" : "bg-bone")}>
              <p className="whitespace-pre-line">{m.body}</p>
              <p className={cn("mt-1 text-[11px]", mine ? "text-stone" : "text-taupe")}>
                {mine ? "You" : (m.author.name ?? "Customer")} · {formatDate(m.createdAt, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </li>
          );
        })}
      </ol>
      {closed ? (
        <p className="text-sm text-taupe">This conversation is closed.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) run(() => replyInquiryAction({ inquiryId, message: text }), () => setText(""));
          }}
        >
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" maxLength={2000} aria-label="Reply" />
          <Button type="submit" loading={pending} disabled={!text.trim()}>
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
