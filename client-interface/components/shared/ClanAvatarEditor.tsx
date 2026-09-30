"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "./Avatar";
import { apiClient } from "@/lib/services/api-client";
import { extractApiErrorMessage } from "@/lib/utils/api-error";

export function ClanAvatarEditor({
  clanId,
  name,
  avatarUrl,
  onChanged,
}: {
  clanId: string;
  name: string;
  avatarUrl?: string | null;
  onChanged: (avatarUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Choose a PNG, JPG or WebP up to 5 MB");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await apiClient.post<{ data: { avatarUrl: string } }>(`/clans/${clanId}/avatar`, body);
      onChanged(result.data.avatarUrl);
      toast.success("Clan photo updated");
    } catch (error) {
      toast.error(extractApiErrorMessage(error, "Could not upload clan photo"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await apiClient.delete(`/clans/${clanId}/avatar`);
      onChanged(null);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, "Could not remove photo"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/30 p-4">
      <Avatar name={name} src={avatarUrl} size="lg" />
      <div className="flex-1">
        <p className="text-sm font-medium">
          Clan photo{" "}
          <span className="font-normal text-muted-foreground">· optional</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PNG, JPG or WebP · up to 5 MB. Initials appear when no photo is set.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            disabled={busy}
            onClick={() => input.current?.click()}
            className="text-sm font-medium text-brand-700 disabled:opacity-50"
          >
            {busy ? "Updating…" : avatarUrl ? "Change photo" : "Add photo"}
          </button>
          {avatarUrl && (
            <button
              disabled={busy}
              onClick={remove}
              className="text-sm text-muted-foreground disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        aria-label="Upload clan photo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => upload(event.target.files?.[0])}
      />
    </div>
  );
}
