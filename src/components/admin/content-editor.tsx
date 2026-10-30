"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  deletePost,
  savePost,
  setPostPublished,
} from "@/app/(app)/app/admin/(panel)/content/actions";
import { useToast } from "@/stores";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageUpload } from "@/components/admin/image-upload";

export type AdminPost = {
  id: string;
  kind: "blog" | "doc";
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string | null;
  coverImageUrl: string | null;
  section: string | null;
  author: string | null;
  sortOrder: number;
  published: boolean;
  publishedAt: string | null;
};

/**
 * Writing the blog and the documentation.
 *
 * TWO TABS, ONE EDITOR, because a post and a doc page are the same thing:
 * title, slug, summary, markdown, cover, publish. The only real difference
 * is that docs sit under a section heading and in a chosen order, and blog
 * posts go newest first — so `section` and `sort order` show for one and not
 * the other, rather than being two separate screens.
 *
 * SAME SHAPE AS THE PORTFOLIO EDITOR on purpose. Somebody who has published
 * a project should not have to learn a second set of habits to publish a
 * post: the same labelled buttons, the same side panel, the same rule that
 * publishing is its own action and new things are drafts.
 */
export function ContentEditor({ posts }: { posts: AdminPost[] }) {
  const [tab, setTab] = useState<"blog" | "doc">("blog");
  const [editing, setEditing] = useState<AdminPost | "new" | null>(null);

  const shown = posts.filter((p) => p.kind === tab);
  const counts = {
    blog: posts.filter((p) => p.kind === "blog").length,
    doc: posts.filter((p) => p.kind === "doc").length,
  };

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-border">
        {(["blog", "doc"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
              tab === key
                ? "border-accent font-medium text-accent"
                : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {key === "blog"
              ? `Blog (${counts.blog})`
              : `Documentation (${counts.doc})`}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          {tab === "blog"
            ? "Shown on blog.highzcore.tech, newest first."
            : "Shown on docs.highzcore.tech, grouped by section in the order you set."}
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
        >
          <Plus className="size-4" aria-hidden="true" />
          {tab === "blog" ? "Write a post" : "Add a page"}
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {shown.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-fg-muted">
            {tab === "blog"
              ? "No posts yet. The first one is the hardest."
              : "No pages yet."}
          </li>
        ) : (
          shown.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              onEdit={() => setEditing(post)}
            />
          ))
        )}
      </ul>

      {editing ? (
        <PostForm
          post={editing === "new" ? null : editing}
          kind={editing === "new" ? tab : editing.kind}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function PostRow({ post, onEdit }: { post: AdminPost; onEdit: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = (fn: () => Promise<{ ok: boolean }>, done: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(done);
        router.refresh();
      } else toast.error("That did not save.");
    });

  const href = `/${post.kind === "blog" ? "blog" : "docs"}/${post.slug}`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {post.title}
          {!post.published ? (
            <span className="ml-2 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent">
              Draft
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-fg-muted">
          {post.section ? `${post.section} · ` : ""}
          {href}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Link
          href={href}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          {post.published ? "View" : "Preview"}
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            act(
              () => setPostPublished(post.id, !post.published),
              post.published ? "Taken off the site." : "Published.",
            )
          }
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
            post.published
              ? "border-border text-fg-muted hover:text-fg"
              : "border-chart-up/50 text-chart-up hover:bg-chart-up/10"
          }`}
        >
          {post.published ? (
            <>
              <EyeOff className="size-3.5" aria-hidden="true" />
              Unpublish
            </>
          ) : (
            <>
              <Eye className="size-3.5" aria-hidden="true" />
              Publish
            </>
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${post.title}`}
          title="Delete"
          className="rounded-lg border border-border p-1.5 text-fg-subtle transition-colors hover:border-chart-down/50 hover:text-chart-down disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={post.kind === "blog" ? "Delete this post?" : "Delete this page?"}
          subject={post.title}
          body="The writing goes with it and cannot be recovered. If you only want it off the site, unpublish it instead."
          action="Delete"
          destructive
          pending={pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            act(() => deletePost(post.id), "Deleted.");
          }}
        />
      ) : null}
    </li>
  );
}

function PostForm({
  post,
  kind,
  onClose,
}: {
  post: AdminPost | null;
  kind: "blog" | "doc";
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [f, setF] = useState({
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    excerpt: post?.excerpt ?? "",
    bodyMd: post?.bodyMd ?? "",
    section: post?.section ?? "",
    author: post?.author ?? "",
    coverImageUrl: post?.coverImageUrl ?? "",
    sortOrder: post?.sortOrder?.toString() ?? "0",
  });

  const set = (k: keyof typeof f) => (v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const isDoc = kind === "doc";

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="surface-raised relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">
            {post
              ? isDoc
                ? "Edit page"
                : "Edit post"
              : isDoc
                ? "Add a page"
                : "Write a post"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-fg-muted transition-colors hover:text-fg"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <Field label="Title" required value={f.title} onChange={set("title")} />
          <Field
            label="Address"
            value={f.slug}
            onChange={set("slug")}
            hint={`/${isDoc ? "docs" : "blog"}/${f.slug || "…"} — left blank, it is made from the title.`}
          />
          <Field
            label="Summary"
            required
            rows={2}
            value={f.excerpt}
            onChange={set("excerpt")}
            hint="One or two lines. Shown in the list and under the title."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {isDoc ? (
              <>
                <Field
                  label="Section"
                  value={f.section}
                  onChange={set("section")}
                  hint="The heading it sits under."
                />
                <Field
                  label="Order"
                  value={f.sortOrder}
                  onChange={set("sortOrder")}
                  hint="Lower shows first."
                />
              </>
            ) : (
              <Field label="Author" value={f.author} onChange={set("author")} />
            )}
          </div>

          <ImageUpload
            label="Cover image"
            value={f.coverImageUrl}
            onChange={set("coverImageUrl")}
            folder={`${kind}/${f.slug || "new"}`}
            hint="Optional. Shown at the top and in the list."
          />

          <Field
            label={isDoc ? "The page" : "The post"}
            rows={16}
            value={f.bodyMd}
            onChange={set("bodyMd")}
            hint="Markdown: ## heading, ### sub-heading, - bullet, 1. numbered, **bold**, `code`, > quote."
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2.5 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await savePost({ id: post?.id, kind, ...f });
                if (res.ok) {
                  toast.success(post ? "Saved." : "Saved as a draft.");
                  onClose();
                  router.refresh();
                } else toast.error(ERRORS[res.error] ?? ERRORS.generic);
              })
            }
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  rows,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
  required?: boolean;
}) {
  const id = `c-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium">
        {label}
        {required ? <span className="ml-1 text-accent">*</span> : null}
      </label>
      {rows ? (
        <textarea
          id={id}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        />
      )}
      {hint ? <p className="mt-1 text-[11px] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

const ERRORS: Record<string, string> = {
  forbidden: "You do not have permission to publish.",
  bad_title: "Give it a title.",
  bad_excerpt: "Write a summary — it is what shows in the list.",
  bad_slug: "That address cannot be used in a URL.",
  slug_taken: "Something else already uses that address.",
  generic: "That did not save. Try again.",
};
