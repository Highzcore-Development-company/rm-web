import {
  SkeletonHeading,
  SkeletonPage,
  SkeletonTable,
} from "@/components/admin/skeleton";

/**
 * Shown while this page fetches.
 *
 * Without it Next keeps the PREVIOUS page on screen until the new one is
 * ready, so a nav click looks like nothing happened and people click again.
 */
export default function Loading() {
  return (
    <SkeletonPage label="Loading users">
      <SkeletonHeading />
      <div className="mt-8">
        <SkeletonTable cols={5} />
      </div>
    </SkeletonPage>
  );
}
