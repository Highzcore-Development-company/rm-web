import { redirect } from "next/navigation";

/**
 * /app had no page, so it 404'd — an obvious URL to type, and the one people
 * shorten to when telling someone where the product lives.
 *
 * It is the desk, so this redirects rather than duplicating it. permanent:
 * false, because which page /app means is a product decision that may change,
 * and a 308 would be cached by browsers long after we changed our minds.
 */
export default function AppIndexPage() {
  redirect("/app/dashboard");
}
