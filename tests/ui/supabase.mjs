// This module replaces the Supabase client only in the esbuild browser fixture.
// There are no credentials, SDK calls or remote endpoints in this harness.
const params = new URLSearchParams(location.search);
export const user = { id: "local-reader", email: "reader@example.test" };
export const isConfigured = true;
export const BUCKET = "novels";
export const series = Array.from({ length: 26 }, (_, i) => ({
  id: `work-${i}`,
  owner_id: user.id,
  title:
    i === 0
      ? "A biblioteca das estrelas esquecidas"
      : i === 1
        ? "Uma jornada extraordinariamente longa através de mundos distantes"
        : `História ${i + 1}`,
  description:
    "Uma história para descobrir com calma. Novos caminhos, encontros inesperados e um lugar para voltar.",
  cover_path: i === 2 ? "broken" : i > 2 ? "cover" : null,
  format: ["novel", "manga", "manhwa"][i % 3],
  created_at: "2026-01-01",
  beta_visible: false,
  rights_note: null,
}));
export const books = Array.from({ length: 4 }, (_, i) => ({
  id: `book-${i}`,
  owner_id: user.id,
  series_id: series[0].id,
  title:
    i === 0
      ? "Um capítulo com um título muito longo que precisa caber no celular sem empurrar os controles"
      : `Capítulo ${i + 1}`,
  chapter_title: null,
  chapter_number: i + 1,
  volume_id: null,
  sort_order: i,
  content_type: "chapter",
  media_type: params.get("screen") === "cbz" ? "cbz" : "pdf",
  file_path: "chapter",
  original_filename: "local.cbz",
  size_bytes: 1000,
  total_pages: 3,
  created_at: "2026-01-01",
}));
const history = series.slice(0, 3).map((work, i) => ({
  owner_id: user.id,
  book_id: books[i].id,
  page_number: 2,
  page_count: 3,
  scroll_ratio: 0.5,
  completed: false,
  updated_at: "2026-01-01",
  books: { ...books[i], series: work, volumes: null },
}));
let failOnce = params.get("state") === "error";
const favorites = new Set();
const profile = {
  id: user.id,
  nickname: "leitor_nook",
  display_name: "Meu canto de leitura",
  bio: "Histórias para acompanhar sem pressa.",
  avatar: "✦",
  preferences: {
    lineHeight: 2.05,
    textWidth: 820,
    showIllustrations: false,
    futureSetting: "preserved",
  },
};
const calls = [];
let saveFailure = params.get("state") === "save-error";
window.__nookTest = { calls, profile, favorites };
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
  }
  select(columns = "") {
    this.columns = columns;
    return this;
  }
  eq(key, value) {
    this.filters.push([key, value]);
    return this;
  }
  order() {
    return this;
  }
  range(from, to) {
    this.window = [from, to];
    return this;
  }
  limit(n) {
    this.window = [0, n - 1];
    return this;
  }
  in() {
    return this;
  }
  returns() {
    return this;
  }
  ilike(key, value) {
    this.search = [key, value.replaceAll("%", "").toLowerCase()];
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  upsert(row) {
    if (this.table === "favorites") favorites.add(row.series_id);
    this.write = true;
    return this;
  }
  delete() {
    this.write = true;
    return this;
  }
  update() {
    this.write = true;
    return this;
  }
  insert(row) {
    calls.push({ table: this.table, insert: row });
    if (this.table === "series") {
      this.created = { ...series[0], ...row, id: "created-work" };
      series.push(this.created);
    }
    return this;
  }
  async then(resolve, reject) {
    try {
      if (params.get("state") === "loading")
        await new Promise((r) => setTimeout(r, 1200));
      if (this.table === "series" && failOnce) {
        failOnce = false;
        return resolve({
          data: null,
          error: { message: "Local simulated failure" },
        });
      }
      let data =
        this.table === "series"
          ? series
          : this.table === "books"
            ? books
            : this.table === "favorites"
              ? [...favorites].map((series_id) => ({ series_id }))
              : [];
      if (this.table === "beta_access")
        data = [{ role: "admin", revoked: false, expires_at: "infinity" }];
      if (this.table === "profiles") data = [profile];
      if (this.created) data = [this.created];
      if (this.table === "reading_progress")
        data = this.columns.includes("books!inner")
          ? history
          : this.one
            ? []
            : history;
      for (const [key, value] of this.filters)
        if (data.some((row) => key in row))
          data = data.filter((row) => row[key] === value);
      if (this.search)
        data = data.filter((row) =>
          row[this.search[0]].toLowerCase().includes(this.search[1]),
        );
      if (params.get("state") === "empty" && this.table === "series") data = [];
      if (this.columns?.includes("favorites!inner"))
        data = data.filter((row) => favorites.has(row.id));
      if (this.window) data = data.slice(this.window[0], this.window[1] + 1);
      if (this.write) {
        if (this.table === "favorites")
          for (const [key, value] of this.filters)
            if (key === "series_id") favorites.delete(value);
        data = [];
      }
      return resolve({ data: this.one ? data[0] || null : data, error: null });
    } catch (error) {
      return reject(error);
    }
  }
}
const api = {
  from: (table) => new Query(table),
  rpc: async (name, args = {}) => {
    calls.push({ name, args });
    if (params.get("state") === "loading")
      await new Promise((r) => setTimeout(r, 1200));
    if (name === "patch_profile_settings") {
      profile.preferences = { ...profile.preferences, ...args.settings };
      Object.assign(profile, args.identity_fields);
      return { data: profile.preferences, error: null };
    }
    if (name === "save_reading_position") {
      if (saveFailure) {
        saveFailure = false;
        return {
          data: null,
          error: {
            message: "network",
            code: params.has("conflict") ? "40001" : "FETCH",
          },
        };
      }
      return { data: new Date().toISOString(), error: null };
    }
    if (["browse_catalog", "admin_library_page"].includes(name)) {
      if (failOnce) {
        failOnce = false;
        return { data: null, error: { message: "Local simulated failure" } };
      }
      let rows =
        params.get("state") === "empty"
          ? []
          : series.map((s, i) => ({
              ...s,
              is_favorite: favorites.has(s.id),
              reading_state:
                i === 25 ? "completed" : i < 3 ? "reading" : "unread",
              chapter_count: i === 0 ? 4 : 1,
              completed_count: i === 25 ? 1 : 0,
              volume_count: 0,
            }));
      rows = rows.filter(
        (s) =>
          (!args.filter_format || s.format === args.filter_format) &&
          (!args.favorites_only || s.is_favorite) &&
          (!args.reading_state ||
            args.reading_state === "all" ||
            s.reading_state === args.reading_state) &&
          (!args.search_term ||
            s.title.toLowerCase().includes(args.search_term.toLowerCase()) ||
            (name === "admin_library_page" &&
              s.id === "work-0" &&
              args.search_term.includes("capítulo"))),
      );
      if (args.sort_by === "title" || name === "admin_library_page")
        rows.sort((a, b) => a.title.localeCompare(b.title));
      return {
        data: {
          items: rows.slice(args.page_index * 24, (args.page_index + 1) * 24),
          totalCount: rows.length,
          hasMore: rows.length > (args.page_index + 1) * 24,
          looseBooks: [],
          looseCount: 0,
          fileCount: books.length,
        },
        error: null,
      };
    }
    if (name === "reader_work_page")
      return {
        data: {
          series: series[0],
          books,
          volumes: [],
          progress: [],
          firstBook: books[0],
          lastRead: null,
          chapterCount: 104,
          completedCount: 0,
          volumeCount: 0,
          hasMore: args.page_index === 0,
        },
        error: null,
      };
    if (name === "admin_books_page")
      return {
        data: {
          books,
          series: [series[0]],
          volumes: [],
          totalCount: books.length,
        },
        error: null,
      };
    return { data: [], error: null };
  },
  auth: {
    getUser: async () => ({
      data: {
        user:
          params.get("screen") === "auth" || !params.get("screen")
            ? null
            : user,
      },
      error: null,
    }),
    getSession: async () => ({ data: { session: { user } }, error: null }),
    onAuthStateChange: () => ({
      data: { listener: null, subscription: { unsubscribe() {} } },
    }),
    signOut: async () => {},
  },
  storage: {
    from: (bucket) => ({
      createSignedUrl: async (path) => ({
        data: {
          signedUrl:
            bucket === "novels"
              ? "/chapter.cbz"
              : path === "broken"
                ? "/missing.png"
                : "/cover.png",
        },
        error: null,
      }),
    }),
  },
};
export const supabase = () => api;
