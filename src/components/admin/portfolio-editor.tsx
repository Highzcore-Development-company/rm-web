"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  deleteProject,
  deleteStudioWork,
  saveProject,
  saveStudioWork,
  setProjectPublished,
  setWorkPublished,
} from "@/app/(app)/app/admin/(panel)/portfolio/actions";
import { useToast } from "@/stores";
import { ConfirmDialog } from "@/components/confirm-dialog";

export type AdminProject = {
  id: string;
  slug: string;
  title: string;
  client: string | null;
  summary: string;
  bodyMd: string | null;
  techStack: string[];
  category: string | null;
  coverImageUrl: string | null;
  images: string[];
  year: number | null;
  externalUrl: string | null;
  sortOrder: number;
  published: boolean;
};

export type AdminWork = {
  id: string;
  title: string;
  client: string | null;
  projectType: string | null;
  summary: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  published: boolean;
};

/**
 * Portfolio and Studio, for the people who maintain them.
 *
 * Esther: "in the admin page I didn't see where I can add to the portfolio."
 * There was nowhere — the data was imported and the public pages built, and
 * the only way to add a project was a SQL statement.
 *
 * THE FIELDS ARE highscore-tech-web's, from PortfolioForm and StudioWorkForm:
 * title, slug, summary, the markdown body, client, category, year, sort
 * order, external link and the comma-separated tech stack. Theirs is the
 * form Victor already works with, so the shape is not mine to redesign.
 *
 * PUBLISHING IS ITS OWN BUTTON, never a checkbox inside the form. It is the
 * one field that changes who can see the row, and a switch buried among
 * twelve inputs is one somebody flips without noticing. A new project is
 * always a draft.
 *
 * IMAGES ARE URLs, not uploads. rm-web has no storage bucket — that is a
 * bucket plus its own policies, and it is the one part of this that is not
 * another table. A URL works today with an image hosted anywhere, and
 * swapping it for an upload later changes this form, not the schema.
 */
export function PortfolioEditor({
  projects,
  works,
}: {
  projects: AdminProject[];
  works: AdminWork[];
}) {
  const [tab, setTab] = useState<"projects" | "studio">("projects");

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-border">
        {(["projects", "studio"] as const).map((key) => (
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
            {key === "projects"
              ? `Projects (${projects.length})`
              : `Studio (${works.length})`}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "projects" ? (
          <ProjectList projects={projects} />
        ) : (
          <WorkList works={works} />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- projects */

function ProjectList({ projects }: { projects: AdminProject[] }) {
  const [editing, setEditing] = useState<AdminProject | "new" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          Shown on build.highzcore.tech. Drafts are invisible to the public.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a project
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {projects.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-fg-muted">
            Nothing yet. Add the first one.
          </li>
        ) : (
          projects.map((p) => (
            <ProjectRow key={p.id} project={p} onEdit={() => setEditing(p)} />
          ))
        )}
      </ul>

      {editing ? (
        <ProjectForm
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ProjectRow({
  project,
  onEdit,
}: {
  project: AdminProject;
  onEdit: () => void;
}) {
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

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {project.title}
          {!project.published ? (
            <span className="ml-2 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent">
              Draft
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-fg-muted">
          {project.client ?? "Our own product"} · /build/{project.slug}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href={`/build/${project.slug}`}
          target="_blank"
          className="rounded-lg border border-border px-2 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          View
        </Link>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${project.title}`}
          className="rounded-lg border border-border p-1.5 text-fg-muted transition-colors hover:text-fg"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            act(
              () => setProjectPublished(project.id, !project.published),
              project.published ? "Unpublished." : "Published.",
            )
          }
          aria-label={project.published ? "Unpublish" : "Publish"}
          className={`rounded-lg border p-1.5 transition-colors disabled:opacity-50 ${
            project.published
              ? "border-chart-up/40 text-chart-up"
              : "border-border text-fg-subtle hover:text-fg"
          }`}
        >
          {project.published ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${project.title}`}
          className="rounded-lg border border-border p-1.5 text-fg-subtle transition-colors hover:border-chart-down/50 hover:text-chart-down disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this project?"
          subject={project.title}
          body="The case study and its images go with it. This cannot be undone — if you only want it off the site, unpublish it instead."
          action="Delete"
          destructive
          pending={pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            act(() => deleteProject(project.id), "Deleted.");
          }}
        />
      ) : null}
    </li>
  );
}

function ProjectForm({
  project,
  onClose,
}: {
  project: AdminProject | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [f, setF] = useState({
    title: project?.title ?? "",
    slug: project?.slug ?? "",
    summary: project?.summary ?? "",
    bodyMd: project?.bodyMd ?? "",
    client: project?.client ?? "",
    category: project?.category ?? "",
    year: project?.year?.toString() ?? "",
    sortOrder: project?.sortOrder?.toString() ?? "0",
    externalUrl: project?.externalUrl ?? "",
    techStack: project?.techStack.join(", ") ?? "",
    coverImageUrl: project?.coverImageUrl ?? "",
    images: project?.images.join("\n") ?? "",
  });

  const set = (k: keyof typeof f) => (v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  function submit() {
    start(async () => {
      const res = await saveProject({ id: project?.id, ...f });
      if (res.ok) {
        toast.success(project ? "Saved." : "Added as a draft.");
        onClose();
        router.refresh();
      } else {
        toast.error(ERRORS[res.error] ?? ERRORS.generic);
      }
    });
  }

  return (
    <Drawer
      title={project ? "Edit project" : "Add a project"}
      onClose={onClose}
      pending={pending}
      onSave={submit}
    >
      <Field label="Title" required value={f.title} onChange={set("title")} />
      <Field
        label="Slug"
        value={f.slug}
        onChange={set("slug")}
        hint={`The address: /build/${f.slug || "…"}. Left blank, it is made from the title.`}
      />
      <Field
        label="Summary"
        required
        rows={3}
        value={f.summary}
        onChange={set("summary")}
        hint="One or two sentences. Shown on the card."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" value={f.client} onChange={set("client")} hint="Blank for our own products." />
        <Field label="Category" value={f.category} onChange={set("category")} hint="AI / Software / Mobile" />
        <Field label="Year" value={f.year} onChange={set("year")} />
        <Field label="Sort order" value={f.sortOrder} onChange={set("sortOrder")} hint="Lower shows first." />
      </div>
      <Field label="External link" value={f.externalUrl} onChange={set("externalUrl")} hint="The live thing, if it is public." />
      <Field label="Tech stack" value={f.techStack} onChange={set("techStack")} hint="Comma separated." />
      <Field label="Cover image URL" value={f.coverImageUrl} onChange={set("coverImageUrl")} hint="Blank uses the first image below." />
      <Field label="Image URLs" rows={3} value={f.images} onChange={set("images")} hint="One per line." />
      <Field
        label="Case study"
        rows={10}
        value={f.bodyMd}
        onChange={set("bodyMd")}
        hint="Markdown: ## headings, - bullets, **bold**."
      />
    </Drawer>
  );
}

/* ----------------------------------------------------------------- studio */

function WorkList({ works }: { works: AdminWork[] }) {
  const [editing, setEditing] = useState<AdminWork | "new" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          Shown on studio.highzcore.tech. Paste a YouTube link and the still
          is filled in for you.
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-accent-hot"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a video
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {works.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-fg-muted">
            Nothing yet.
          </li>
        ) : (
          works.map((w) => (
            <WorkRow key={w.id} work={w} onEdit={() => setEditing(w)} />
          ))
        )}
      </ul>

      {editing ? (
        <WorkForm
          work={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function WorkRow({ work, onEdit }: { work: AdminWork; onEdit: () => void }) {
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

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {work.title}
          {!work.published ? (
            <span className="ml-2 rounded border border-accent/40 px-1.5 py-0.5 text-[10px] text-accent">
              Draft
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-fg-muted">
          {work.client ?? "—"}
          {work.projectType ? ` · ${work.projectType}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${work.title}`}
          className="rounded-lg border border-border p-1.5 text-fg-muted transition-colors hover:text-fg"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            act(
              () => setWorkPublished(work.id, !work.published),
              work.published ? "Unpublished." : "Published.",
            )
          }
          aria-label={work.published ? "Unpublish" : "Publish"}
          className={`rounded-lg border p-1.5 transition-colors disabled:opacity-50 ${
            work.published
              ? "border-chart-up/40 text-chart-up"
              : "border-border text-fg-subtle hover:text-fg"
          }`}
        >
          {work.published ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${work.title}`}
          className="rounded-lg border border-border p-1.5 text-fg-subtle transition-colors hover:border-chart-down/50 hover:text-chart-down disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this video?"
          subject={work.title}
          body="It comes off the studio page for good. If you only want it hidden, unpublish it instead."
          action="Delete"
          destructive
          pending={pending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            act(() => deleteStudioWork(work.id), "Deleted.");
          }}
        />
      ) : null}
    </li>
  );
}

function WorkForm({
  work,
  onClose,
}: {
  work: AdminWork | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [f, setF] = useState({
    title: work?.title ?? "",
    client: work?.client ?? "",
    projectType: work?.projectType ?? "",
    summary: work?.summary ?? "",
    videoUrl: work?.videoUrl ?? "",
    posterUrl: work?.posterUrl ?? "",
    sortOrder: "0",
  });

  const set = (k: keyof typeof f) => (v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  return (
    <Drawer
      title={work ? "Edit video" : "Add a video"}
      onClose={onClose}
      pending={pending}
      onSave={() =>
        start(async () => {
          const res = await saveStudioWork({ id: work?.id, ...f });
          if (res.ok) {
            toast.success(work ? "Saved." : "Added as a draft.");
            onClose();
            router.refresh();
          } else toast.error(ERRORS[res.error] ?? ERRORS.generic);
        })
      }
    >
      <Field label="Title" required value={f.title} onChange={set("title")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" value={f.client} onChange={set("client")} />
        <Field
          label="Type"
          value={f.projectType}
          onChange={set("projectType")}
          hint="Advert / Jingle / Business"
        />
      </div>
      <Field
        label="YouTube link"
        value={f.videoUrl}
        onChange={set("videoUrl")}
        hint="Paste the normal watch link. The still is filled in from it."
      />
      <Field
        label="Still image URL"
        value={f.posterUrl}
        onChange={set("posterUrl")}
        hint="Only needed if it is not a YouTube video."
      />
      <Field
        label="Short description"
        rows={3}
        value={f.summary}
        onChange={set("summary")}
        hint="One or two lines. Shown under the video."
      />
    </Drawer>
  );
}

/* ------------------------------------------------------------------ bits */

/**
 * The editing panel.
 *
 * A side sheet rather than a modal: these forms are twelve fields and a
 * markdown body, and a dialog that tall becomes its own scrolling page with
 * the list hidden behind it.
 */
function Drawer({
  title,
  children,
  onClose,
  onSave,
  pending,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div className="surface-raised relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
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
          {children}
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
            onClick={onSave}
            disabled={pending}
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
  const id = `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
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
  forbidden: "You do not have permission to change the portfolio.",
  bad_title: "Give it a title.",
  bad_summary: "Write a summary — it is what shows on the card.",
  bad_slug: "That slug cannot be used in a URL.",
  bad_year: "That is not a year.",
  slug_taken: "Another project already uses that slug.",
  title_taken: "Another video already uses that title.",
  generic: "That did not save. Try again.",
};
