import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

export type MemoryObservation =
  | {
      readonly method: "linux-procfs-rss" | "macos-ps-rss" | "windows-working-set";
      readonly residentSetBytes: number;
      readonly status: "observed";
    }
  | {
      readonly method: "unsupported-platform";
      readonly residentSetBytes: null;
      readonly status: "not-run";
    };

const execFileAsync = promisify(execFile);

export async function captureStableProcessMemory(
  rootPid: number,
  platform: NodeJS.Platform = process.platform,
): Promise<MemoryObservation> {
  switch (platform) {
    case "linux":
      return {
        method: "linux-procfs-rss",
        residentSetBytes: await readLinuxProcessTreeRss(rootPid, new Set<number>()),
        status: "observed",
      };
    case "darwin":
      return {
        method: "macos-ps-rss",
        residentSetBytes: await readMacOsProcessTreeRss(rootPid),
        status: "observed",
      };
    case "win32":
      return {
        method: "windows-working-set",
        residentSetBytes: await readWindowsProcessTreeWorkingSet(rootPid),
        status: "observed",
      };
    default:
      return { method: "unsupported-platform", residentSetBytes: null, status: "not-run" };
  }
}

async function readLinuxProcessTreeRss(rootPid: number, visited: Set<number>): Promise<number> {
  if (visited.has(rootPid)) {
    return 0;
  }
  visited.add(rootPid);
  let status: string;
  let children: string;
  try {
    [status, children] = await Promise.all([
      readFile(`/proc/${rootPid}/status`, "utf8"),
      readFile(`/proc/${rootPid}/task/${rootPid}/children`, "utf8"),
    ]);
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return 0;
    }
    throw cause;
  }
  const residentSetKilobytes = readLinuxResidentSetKilobytes(status);
  const childTotals = await Promise.all(
    children
      .trim()
      .split(/\s+/u)
      .filter((value) => value.length > 0)
      .map((value) => readLinuxProcessTreeRss(Number.parseInt(value, 10), visited)),
  );
  return residentSetKilobytes * 1024 + childTotals.reduce((total, value) => total + value, 0);
}

function readLinuxResidentSetKilobytes(status: string): number {
  const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/mu);
  if (match?.[1] === undefined) {
    return 0;
  }
  return Number.parseInt(match[1], 10);
}

async function readMacOsProcessTreeRss(rootPid: number): Promise<number> {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,rss="], {
    encoding: "utf8",
  });
  const processes = stdout.split(/\r?\n/u).flatMap((line) => {
    const values = line.trim().split(/\s+/u);
    const pid = values[0];
    const parentPid = values[1];
    const residentSetKilobytes = values[2];
    return pid === undefined || parentPid === undefined || residentSetKilobytes === undefined
      ? []
      : [
          {
            parentPid: Number.parseInt(parentPid, 10),
            pid: Number.parseInt(pid, 10),
            residentSetKilobytes: Number.parseInt(residentSetKilobytes, 10),
          },
        ];
  });
  const included = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const processRow of processes) {
      if (included.has(processRow.parentPid) && !included.has(processRow.pid)) {
        included.add(processRow.pid);
        changed = true;
      }
    }
  }
  return (
    processes
      .filter((processRow) => included.has(processRow.pid))
      .reduce((total, processRow) => total + processRow.residentSetKilobytes, 0) * 1024
  );
}

async function readWindowsProcessTreeWorkingSet(rootPid: number): Promise<number> {
  const script = [
    "$all = Get-CimInstance Win32_Process",
    `$ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${rootPid})`,
    "do { $changed = $false; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true } } } while ($changed)",
    "$total = 0; foreach ($id in $ids) { $p = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($null -ne $p) { $total += $p.WorkingSet64 } }",
    "[Console]::Write($total)",
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true },
  );
  const bytes = Number.parseInt(stdout.trim(), 10);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    throw new RangeError(`Windows memory snapshot returned ${stdout.trim()}`);
  }
  return bytes;
}
