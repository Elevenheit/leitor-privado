/** Consume a one-shot restart without making future refreshes restart the chapter again. */
export function consumeReaderRestart() {
  const url = new URL(window.location.href);
  const restart = url.searchParams.get("restart") === "1";
  if (restart) {
    url.searchParams.delete("restart");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
  return restart;
}
