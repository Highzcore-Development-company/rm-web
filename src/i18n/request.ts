import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE } from "./locales";

export default getRequestConfig(async () => {
  // Single locale for now, so there is nothing to negotiate. When a second
  // locale is added this reads the locale from the request (cookie, header or
  // route segment) instead of returning the constant.
  const locale = DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
