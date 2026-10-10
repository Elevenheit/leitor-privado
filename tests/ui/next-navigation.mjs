export const usePathname = () => {
  const screen = new URLSearchParams(location.search).get("screen");
  if (["library", "search", "continue", "about", "list"].includes(screen))
    return `/${screen}`;
  if (screen === "admin-work") return "/admin/series/work-0";
  return screen === "admin"
    ? "/admin"
    : screen === "profile"
      ? "/profile"
      : screen === "cbz"
        ? "/media/book-0"
        : "/";
};
const router = { push() {}, replace() {} };
export const useRouter = () => router;
