
const form = document.querySelector("#downloadForm");
const urlInput = document.querySelector("#fileUrl");
const nameInput = document.querySelector("#fileName");
const startBtn = document.querySelector("#startBtn");
const demoBtn = document.querySelector("#demoBtn");
const message = document.querySelector("#message");
const downloadList = document.querySelector("#downloadList");
const fileCount = document.querySelector("#fileCount");

let nextId = 0;

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
    if (bytes === 0) return "0 Bytes";

    const units = ["Bytes", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    return `${(bytes / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function safeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().slice(0, 150) || "download.bin";
}

function getFilename(url) {
    try {
        return safeFilename(decodeURIComponent(new URL(url).pathname.split("/").pop() || "download.bin"));
    } catch {
        return "download.bin";
    }
}

function createCard(name) {
    document.querySelector("#emptyState")?.remove();

    const card = document.createElement("article");
    card.className = "rounded-xl border border-slate-700 bg-[#090f1c] p-4 sm:p-5";

    card.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime-400/10 text-xl text-lime-400">↓</div>
            <div class="min-w-0 flex-1">
                <h3 class="file-name break-words text-sm font-semibold"></h3>
                <p class="file-detail mt-1 break-words text-xs text-slate-400">Preparing...</p>
            </div>
            <span class="file-status text-right text-xs font-semibold text-lime-400">Waiting</span>
        </div>
        <div class="mt-5 h-2 overflow-hidden rounded-full bg-slate-700">
            <div class="progress-bar h-full w-0 rounded-full bg-lime-400 transition-all duration-100"></div>
        </div>
        <div class="progress-meta mt-2 flex justify-between gap-3 text-xs text-slate-400">
            <span class="progress-percent">0%</span>
            <span class="progress-size">0 Bytes</span>
        </div>
        <div class="mt-3 flex justify-end">
            <button type="button" class="cancel-btn rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-white/5">Cancel</button>
        </div>
    `;

    card.querySelector(".file-name").textContent = name;
    downloadList.prepend(card);

    fileCount.textContent = `${downloadList.querySelectorAll("article").length} files`;

    return {
        card,
        name,
        controller: new AbortController(),
        cancelled: false,
        finished: false
    };
}

function updateProgress(item, loaded, total, started) {
    const percent = total ? Math.min(100, Math.floor(loaded / total * 100)) : null;
    const seconds = Math.max((Date.now() - started) / 1000, 0.1);
    const speed = loaded / seconds;

    item.card.querySelector(".progress-bar").style.width =
        percent === null ? "100%" : `${percent}%`;

    item.card.querySelector(".progress-percent").textContent =
        percent === null ? "Downloading..." : `${percent}%`;

    item.card.querySelector(".progress-size").textContent =
        total ? `${formatBytes(loaded)} / ${formatBytes(total)}` : formatBytes(loaded);

    item.card.querySelector(".file-detail").textContent = `${formatBytes(speed)}/s`;
}

function setStatus(item, status, detail) {
    item.card.querySelector(".file-status").textContent = status;
    if (detail) item.card.querySelector(".file-detail").textContent = detail;
}

function saveFile(blob, name) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = safeFilename(name);
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

async function downloadFile(url, customName = "") {
    const item = createCard(customName.trim() ? safeFilename(customName) : getFilename(url));
    const started = Date.now();

    item.card.querySelector(".cancel-btn").addEventListener("click", () => {
        if (!item.finished) {
            item.cancelled = true;
            item.controller.abort();
        }
    });

    try {
        setStatus(item, "Connecting", "Connecting to server...");

        const response = await fetch(url, { signal: item.controller.signal });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const total = Number(response.headers.get("content-length")) || 0;
        const reader = response.body?.getReader();

        if (!reader) {
            const blob = await response.blob();
            saveFile(blob, item.name);
            updateProgress(item, blob.size, blob.size, started);
        } else {
            const chunks = [];
            let loaded = 0;

            setStatus(item, "Downloading", total ? formatBytes(total) : "Size unknown");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loaded += value.length;
                updateProgress(item, loaded, total, started);
            }

            const blob = new Blob(chunks, {
                type: response.headers.get("content-type") || "application/octet-stream"
            });

            saveFile(blob, item.name);
        }

        item.card.querySelector(".progress-bar").style.width = "100%";
        item.card.querySelector(".progress-percent").textContent = "100%";
        setStatus(item, "Complete", "File saved successfully");
        message.textContent = `${item.name} downloaded successfully.`;
        item.card.querySelector(".cancel-btn").remove();
    } catch (error) {
        if (item.cancelled || error.name === "AbortError") {
            setStatus(item, "Cancelled", "Download cancelled");
            item.card.querySelector(".progress-bar").classList.replace("bg-lime-400", "bg-red-400");
            message.textContent = "Download cancelled.";
        } else {
            setStatus(item, "Failed", error.message);
            item.card.querySelector(".progress-bar").classList.replace("bg-lime-400", "bg-red-400");
            message.textContent = "Download failed. Try a direct file URL; some servers block browser downloads (CORS).";
        }

        item.card.querySelector(".cancel-btn").textContent = "Dismiss";
        item.card.querySelector(".cancel-btn").addEventListener("click", () => {
            item.card.remove();
            const count = downloadList.querySelectorAll("article").length;
            fileCount.textContent = `${count} ${count === 1 ? "file" : "files"}`;
        }, { once: true });
    } finally {
        item.finished = true;
    }
}

form.addEventListener("submit", async event => {
    event.preventDefault();

    const url = urlInput.value.trim();

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        message.textContent = "Please enter a valid file URL.";
        return;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        message.textContent = "Only HTTP and HTTPS links are supported.";
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Starting download...";

    try {
        await downloadFile(url, nameInput.value);
    } finally {
        startBtn.disabled = false;
        startBtn.innerHTML = "↓ &nbsp; Download file";
    }
});

demoBtn.addEventListener("click", async () => {
    const content = [
        "Downly Download Manager",
        "========================",
        "This is a real demo text file generated by your project.",
        "Built using HTML, Tailwind CSS and JavaScript."
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const item = createCard("downly-demo.txt");
    const started = Date.now();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    item.card.querySelector(".cancel-btn").addEventListener("click", () => {
        item.cancelled = true;
    });

    try {
        setStatus(item, "Preparing", "Creating demo file...");

        for (let percent = 0; percent <= 100; percent += 10) {
            if (item.cancelled) throw new Error("Cancelled");

            item.card.querySelector(".progress-bar").style.width = `${percent}%`;
            item.card.querySelector(".progress-percent").textContent = `${percent}%`;
            item.card.querySelector(".progress-size").textContent =
                `${formatBytes(Math.floor(bytes.length * percent / 100))} / ${formatBytes(bytes.length)}`;

            await new Promise(resolve => setTimeout(resolve, 70));
        }

        saveFile(blob, "downly-demo.txt");
        setStatus(item, "Complete", "Demo file saved successfully");
        item.card.querySelector(".cancel-btn").remove();
        item.finished = true;
        message.textContent = "Demo file downloaded successfully.";
    } catch {
        setStatus(item, "Cancelled", "Download cancelled");
        item.card.querySelector(".progress-bar").classList.replace("bg-lime-400", "bg-red-400");
        item.card.querySelector(".cancel-btn").textContent = "Dismiss";
    }
});
