export const usePathname = () => {
  const screen = new URLSearchParams(location.search).get("screen");
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
