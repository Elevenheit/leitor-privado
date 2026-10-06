"use client";

import { useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import {
  suggestDraft,
  uploadBatchFile,
  validateBatchFile,
  type BatchDraft,
} from "@/lib/batch-upload";
import type { Series, Volume } from "@/lib/types";
import {
  findDuplicateBook,
  findOrCreateVolume,
  registerUploadedBook,
} from "@/lib/data/uploads";
import { toDataError } from "@/lib/data/errors";
import { BatchUploadItem } from "./batch-upload-item";
import { SeriesPicker, VolumePicker } from "@/components/admin/library-picker";

export function BatchUploadModal({
  ownerId,
  series,
  onClose,
  onComplete,
}: {
  ownerId: string;
  series: Series[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<BatchDraft[]>([]);
  const [seriesId, setSeriesId] = useState("");
  const [volumeId, setVolumeId] = useState("");
  const [newVolume, setNewVolume] = useState("");
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const processing = useRef(false);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [selectedVolume, setSelectedVolume] = useState<Volume | null>(null);
  const completed = drafts.filter((item) => item.status === "done").length;
  const failures = drafts.filter((item) => item.status === "error").length;
  const cancelled = drafts.filter((item) => item.status === "cancelled").length;
  const overallPercent = drafts.length
    ? Math.round(
        drafts.reduce(
          (total, item) =>
            total +
            (item.status === "done"
              ? 100
              : item.status === "registering"
                ? 99
                : item.status === "uploading"
                  ? item.percent
                  : 0),
          0,
        ) / drafts.length,
      )
    : 0;

  function addFiles(files: FileList | File[]) {
    if (processing.current) return;
    const accepted = Array.from(files).filter((file) =>
      /\.(pdf|cbz)$/i.test(file.name),
    );
    if (accepted.length !== files.length)
      setError("Alguns arquivos foram ignorados. São aceitos PDF e CBZ.");
    else setError("");
    setDrafts((previous) =>
      [...previous, ...accepted.map((file) => suggestDraft(file, series))].sort(
        (a, b) =>
          a.file.name.localeCompare(b.file.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
      ),
    );
    if (inputRef.current) inputRef.current.value = "";
  }
  function change(id: string, update: Partial<BatchDraft>) {
    setDrafts((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  async function process(items: BatchDraft[]) {
    if (processing.current) return;
    setError("");
    if (!seriesId || !selectedSeries) {
      setError("Escolha uma obra antes de iniciar o lote.");
      return;
    }
    if (
      volumeId &&
      volumeId !== "new" &&
      (selectedVolume?.id !== volumeId ||
        selectedVolume?.series_id !== seriesId)
    ) {
      setError("O volume escolhido não pertence à obra selecionada.");
      return;
    }
    if (
      volumeId === "new" &&
      (!newVolume.trim() ||
        !Number.isFinite(Number(newVolume)) ||
        Number(newVolume) < 0)
    ) {
      setError("Informe um número válido para o novo volume.");
      return;
    }

    processing.current = true;
    setRunning(true);
    const ready: {
      draft: BatchDraft;
      number: number | null;
      path: string;
      media: Awaited<ReturnType<typeof validateBatchFile>>;
      volumeKey: string;
      volumeId: string | null;
    }[] = [];
    const seenNames = new Set<string>();
    for (const draft of items) {
      if (draft.status === "done") continue;
      const number = draft.chapterNumber.trim()
        ? Number(draft.chapterNumber)
        : null;
      if (number !== null && (!Number.isFinite(number) || number < 0)) {
        change(draft.id, {
          status: "error",
          error: "O número do capítulo precisa ser finito e não negativo.",
        });
        continue;
      }
      const filenameKey = draft.file.name.toLocaleLowerCase();
      if (seenNames.has(filenameKey)) {
        change(draft.id, {
          status: "error",
          error: "Este arquivo aparece mais de uma vez neste lote.",
        });
        continue;
      }
      seenNames.add(filenameKey);
      let media: Awaited<ReturnType<typeof validateBatchFile>>;
      try {
        media = await validateBatchFile(draft.file);
        if (draft.mediaType !== media.mediaType)
          throw new Error("O tipo escolhido não corresponde ao arquivo.");
        if (
          (selectedSeries.format === "novel" && media.mediaType !== "pdf") ||
          (selectedSeries.format !== "novel" && media.mediaType !== "cbz")
        )
          throw new Error(
            "O formato do arquivo não corresponde ao tipo da obra.",
          );
        await findDuplicateBook(seriesId, draft.file.name);
      } catch (cause) {
        change(draft.id, {
          status: "error",
          error: toDataError(cause, "Arquivo inválido ou duplicado.").message,
        });
        continue;
      }
      const volumeKey =
        volumeId === "new"
          ? `number:${seriesId}:${Number(newVolume)}`
          : volumeId
            ? `id:${seriesId}:${volumeId}`
            : draft.volumeNumber === null
              ? `none:${seriesId}`
              : `number:${seriesId}:${draft.volumeNumber}`;
      ready.push({
        draft,
        number,
        path: `${ownerId}/${seriesId}/${draft.id}.${media.extension}`,
        media,
        volumeKey,
        volumeId: volumeId && volumeId !== "new" ? volumeId : null,
      });
    }

    const volumesByKey = new Map<string, string | null>();
    try {
      for (const item of ready) {
        if (volumesByKey.has(item.volumeKey)) {
          item.volumeId = volumesByKey.get(item.volumeKey) || null;
          continue;
        }
        if (item.volumeId) {
          volumesByKey.set(item.volumeKey, item.volumeId);
          continue;
        }
        const needsNumberedVolume =
          volumeId === "new" || (!volumeId && item.draft.volumeNumber !== null);
        if (!needsNumberedVolume) {
          volumesByKey.set(item.volumeKey, null);
          continue;
        }
        const number =
          volumeId === "new" ? Number(newVolume) : item.draft.volumeNumber!;
        const savedForDraft =
          item.draft.resolvedVolumeKey === item.volumeKey
            ? item.draft.resolvedVolumeId
            : null;
        const existing =
          selectedVolume?.volume_number === number
            ? selectedVolume.id
            : undefined;
        const resolved =
          savedForDraft ||
          (await findOrCreateVolume(ownerId, seriesId, number, existing));
        item.volumeId = resolved;
        volumesByKey.set(item.volumeKey, resolved);
      }
      for (const item of ready)
        change(item.draft.id, {
          resolvedVolumeId: item.volumeId,
          resolvedVolumeKey: item.volumeKey,
        });
    } catch (cause) {
      const message = toDataError(
        cause,
        "Não foi possível preparar os volumes.",
      ).message;
      for (const item of ready)
        change(item.draft.id, { status: "error", error: message });
      setRunning(false);
      processing.current = false;
      return;
    }

    let cursor = 0;
    let anySuccess = false;
    const worker = async () => {
      while (cursor < ready.length) {
        const item = ready[cursor++];
        const controller = new AbortController();
        controllers.current.set(item.draft.id, controller);
        change(item.draft.id, { status: "uploading", percent: 0, error: "" });
        try {
          const media = await uploadBatchFile(
            item.draft.file,
            item.path,
            (percent) => change(item.draft.id, { percent }),
            controller.signal,
            item.media,
          );
          change(item.draft.id, { status: "registering", percent: 100 });
          const title = item.draft.title.trim() || item.draft.file.name;
          await registerUploadedBook({
            owner_id: ownerId,
            series_id: seriesId,
            volume_id: item.volumeId,
            title,
            chapter_title: title,
            chapter_number: item.number,
            sort_order: item.number === null ? 0 : item.number * 1000,
            original_filename: item.draft.file.name,
            file_path: item.path,
            size_bytes: item.draft.file.size,
            media_type: media.mediaType,
            total_pages: media.totalPages,
            content_type: "chapter",
          });
          change(item.draft.id, { status: "done", percent: 100 });
          anySuccess = true;
        } catch (cause) {
          const aborted =
            cause instanceof DOMException && cause.name === "AbortError";
          change(item.draft.id, {
            status: aborted ? "cancelled" : "error",
            error: aborted
              ? "Envio cancelado. Tente novamente quando quiser."
              : toDataError(cause, "Falha no envio.").message,
          });
        } finally {
          controllers.current.delete(item.draft.id);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(2, ready.length) }, () => worker()),
    );
    setRunning(false);
    if (anySuccess) {
      try {
        await onComplete();
      } catch (cause) {
        setError(
          toDataError(
            cause,
            "Os arquivos foram enviados, mas a lista não atualizou.",
          ).message,
        );
      }
    }
    processing.current = false;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !running) onClose();
      }}
    >
      <section
        className="form-modal batch-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-upload-title"
      >
        <button
          className="modal-close"
          onClick={onClose}
          disabled={running}
          aria-label="Fechar"
        >
          <X size={19} />
        </button>
        <span className="eyebrow">Acrescentar ao acervo</span>
        <h2 id="batch-upload-title">Adicionar arquivos em lote</h2>
        <p>
          Selecione uma obra e um volume, depois confira a ordem de cada arquivo
          antes do envio.
        </p>
        <div className="batch-destination">
          <SeriesPicker
            ownerId={ownerId}
            value={selectedSeries}
            disabled={running}
            onChange={(work) => {
              setSelectedSeries(work);
              setSeriesId(work?.id || "");
              setVolumeId("");
              setSelectedVolume(null);
            }}
          />
          <VolumePicker
            ownerId={ownerId}
            seriesId={seriesId}
            value={selectedVolume}
            disabled={!seriesId || running}
            onChange={(volume) => {
              setSelectedVolume(volume);
              setVolumeId(volume?.id || "");
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={volumeId === "new"}
              disabled={!seriesId || running}
              onChange={(e) => {
                setVolumeId(e.target.checked ? "new" : "");
                setSelectedVolume(null);
              }}
            />{" "}
            Criar novo volume
          </label>
          {volumeId === "new" && (
            <label>
              Número do novo volume
              <input
                type="number"
                min="0"
                step="any"
                value={newVolume}
                onChange={(event) => setNewVolume(event.target.value)}
                disabled={running}
              />
            </label>
          )}
        </div>
        <div
          className={`batch-dropzone ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <UploadCloud size={25} />
          <strong>Arraste os arquivos aqui</strong>
          <span>PDF e CBZ · você pode selecionar vários arquivos</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => inputRef.current?.click()}
            disabled={running}
          >
            Selecionar arquivos
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.cbz,application/pdf,application/zip,application/vnd.comicbook+zip"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
            }}
            disabled={running}
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {drafts.length > 0 && (
          <>
            <div className="batch-summary">
              <span>
                {completed === drafts.length
                  ? `${completed} de ${drafts.length} arquivos adicionados com sucesso`
                  : !running && (failures || cancelled)
                    ? `${completed} enviados · ${failures} com erro · ${cancelled} cancelados · ${overallPercent}%`
                    : `${completed} de ${drafts.length} enviados · ${overallPercent}%`}
              </span>
              <div className="upload-track">
                <div style={{ width: `${overallPercent}%` }} />
              </div>
            </div>
            <div className="batch-list">
              {drafts.map((draft, index) => (
                <BatchUploadItem
                  key={draft.id}
                  draft={draft}
                  index={index}
                  running={running}
                  onChange={(update) => change(draft.id, update)}
                  onRetry={() => void process([draft])}
                  onCancel={() => controllers.current.get(draft.id)?.abort()}
                  onRemove={() =>
                    setDrafts((previous) =>
                      previous.filter((item) => item.id !== draft.id),
                    )
                  }
                />
              ))}
            </div>
            <div className="batch-actions">
              <button
                className="secondary-button"
                onClick={onClose}
                disabled={running}
              >
                Fechar
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  void process(drafts.filter((item) => item.status !== "done"))
                }
                disabled={
                  running ||
                  !seriesId ||
                  !drafts.some((item) => item.status !== "done")
                }
              >
                {running
                  ? "Enviando…"
                  : `Adicionar ${drafts.filter((item) => item.status !== "done").length} arquivos`}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
