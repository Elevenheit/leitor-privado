"use client";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { catalogSearch } from "@/lib/catalog";
import type { Series, Volume } from "@/lib/types";

type Item = Series | Volume;
type Props<T extends Item> = {
  ownerId: string;
  value: T | null;
  onChange: (item: T | null) => void;
  disabled?: boolean;
  emptyLabel?: string;
};

function LibraryPicker<T extends Item>({
  ownerId,
  value,
  onChange,
  disabled,
  emptyLabel,
  seriesId,
}: Props<T> & { seriesId?: string }) {
  const isVolume = seriesId !== undefined;
  const label = isVolume ? "Volume" : "Obra";
  const selectId = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    items: T[];
    more: boolean;
    error: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${ownerId}:${seriesId}:${query}:${page}:${attempt}`;
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      try {
        if (isVolume && !seriesId) {
          if (live) setResult({ key, items: [], more: false, error: false });
          return;
        }
        let request = supabase()
          .from(isVolume ? "volumes" : "series")
          .select(
            isVolume
              ? "id,owner_id,series_id,volume_number,title,description,sort_order,created_at,updated_at"
              : "id,owner_id,title,description,cover_path,format,created_at,updated_at,tags,rights_note,beta_visible",
          )
          .eq("owner_id", ownerId);
        if (isVolume)
          request = request
            .eq("series_id", seriesId)
            .order("sort_order")
            .order("volume_number");
        else request = request.order("title");
        const term = catalogSearch(query);
        if (term && isVolume && /^\d+(\.\d+)?$/.test(term))
          request = request.eq("volume_number", Number(term));
        else if (term) request = request.ilike("title", `%${term}%`);
        const response = await request
          .order("id")
          .range(page * 20, page * 20 + 20)
          .returns<T[]>();
        if (response.error) throw response.error;
        if (live)
          setResult({
            key,
            items: (response.data || []).slice(0, 20) as T[],
            more: (response.data || []).length > 20,
            error: false,
          });
      } catch {
        if (live) setResult({ key, items: [], more: false, error: true });
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, ownerId, seriesId, isVolume, query, page]);
  const loading = result?.key !== key;
  const rows = !loading ? result?.items || [] : [];
  const options =
    value && !rows.some((row) => row.id === value.id) ? [value, ...rows] : rows;
  return (
    <fieldset className="library-picker" disabled={disabled}>
      <label>
        Buscar {label.toLowerCase()}
        <input
          type="search"
          aria-label={`Buscar ${label.toLowerCase()} para selecionar`}
          placeholder={
            isVolume ? "Título ou número do volume" : "Título da obra"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      <label htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        value={value?.id || ""}
        onChange={(e) =>
          onChange(options.find((item) => item.id === e.target.value) || null)
        }
      >
        <option value="">
          {emptyLabel || (isVolume ? "Sem volume" : "Escolha uma obra")}
        </option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {"volume_number" in item
              ? [
                  item.volume_number !== null
                    ? `Volume ${item.volume_number}`
                    : "Volume",
                  item.title,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : item.title}
          </option>
        ))}
      </select>
      {loading ? (
        <small role="status">Carregando opções…</small>
      ) : result?.error ? (
        <p className="error" role="alert">
          Não foi possível carregar as opções.{" "}
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <div className="picker-pages">
          <button
            type="button"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Anteriores
          </button>
          <small>
            {!rows.length ? "Nenhum resultado" : `Página ${page + 1}`}
          </small>
          <button
            type="button"
            disabled={!result?.more}
            onClick={() => setPage(page + 1)}
          >
            Mais opções
          </button>
        </div>
      )}
    </fieldset>
  );
}
export function SeriesPicker(props: Props<Series>) {
  return <LibraryPicker {...props} />;
}
export function VolumePicker(props: Props<Volume> & { seriesId: string }) {
  return <LibraryPicker key={props.seriesId} {...props} />;
}
