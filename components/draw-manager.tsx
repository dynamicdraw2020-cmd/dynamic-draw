"use client";

import { Archive, CirclePause, CirclePlay, Edit3, Gift, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ProbabilityEditor } from "@/components/probability-editor";
import { StatusBadge } from "@/components/status-badge";
import type { Draw, Reward } from "@/lib/types";
import { formatPercent, probabilityToPercent } from "@/lib/utils";

async function jsonRequest(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "요청을 처리하지 못했습니다.");
  return data;
}

export function DrawManager({ draws }: { draws: Draw[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function createDraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("create-draw");
    try {
      await jsonRequest("/api/admin/draws", "POST", {
        name: form.get("name"),
        description: form.get("description"),
        animationMs: Number(form.get("animationMs")),
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setBusy(null); }
  }

  async function patchDraw(draw: Draw, patch: Record<string, unknown>) {
    setBusy(draw.id);
    try { await jsonRequest(`/api/admin/draws/${draw.id}`, "PATCH", patch); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function editDraw(draw: Draw) {
    const name = window.prompt("뽑기 이름", draw.name);
    if (!name) return;
    const description = window.prompt("뽑기 설명", draw.description ?? "") ?? draw.description;
    await patchDraw(draw, { name, description });
  }

  async function createReward(event: FormEvent<HTMLFormElement>, drawId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(`reward-${drawId}`);
    try {
      await jsonRequest("/api/admin/rewards", "POST", {
        drawId,
        name: form.get("name"),
        description: form.get("description"),
        color: form.get("color"),
        stock: form.get("stock") ? Number(form.get("stock")) : null,
        isInventoryItem: form.get("isInventoryItem") === "on",
        isExchangeMaterial: form.get("isExchangeMaterial") === "on",
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setBusy(null); }
  }

  async function editReward(reward: Reward) {
    const name = window.prompt("상품명", reward.name);
    if (!name) return;
    const description = window.prompt("상품 설명", reward.description ?? "") ?? reward.description;
    const stockText = window.prompt("재고 수량 (무제한은 비워두기)", reward.stock === null ? "" : String(reward.stock));
    setBusy(reward.id);
    try {
      await jsonRequest(`/api/admin/rewards/${reward.id}`, "PATCH", {
        name,
        description,
        stock: stockText === "" || stockText === null ? null : Number(stockText),
      });
      router.refresh();
    } catch (error) { window.alert((error as Error).message); } finally { setBusy(null); }
  }

  async function deleteReward(reward: Reward) {
    if (!window.confirm(`“${reward.name}” 상품을 비활성화할까요? 기존 결과 기록은 보존됩니다.`)) return;
    setBusy(reward.id);
    try { await jsonRequest(`/api/admin/rewards/${reward.id}`, "DELETE"); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="grid">
      <form className="panel panel-pad form-grid" onSubmit={createDraw}>
        <div><h2 className="panel-title">새 뽑기 만들기</h2><p className="panel-description">생성 후 상품과 확률을 넣고 진행 상태로 바꿉니다.</p></div>
        <div className="form-row">
          <div className="field"><label htmlFor="draw-name">뽑기 이름</label><input id="draw-name" className="input" name="name" required maxLength={80} placeholder="예: 입장권 뽑기" /></div>
          <div className="field"><label htmlFor="animation-ms">연출 시간</label><select id="animation-ms" className="select" name="animationMs" defaultValue="4000"><option value="3000">3초</option><option value="4000">4초</option><option value="5000">5초</option></select></div>
        </div>
        <div className="field"><label htmlFor="draw-description">설명</label><input id="draw-description" className="input" name="description" maxLength={300} placeholder="사용자에게 표시할 설명" /></div>
        <button className="btn btn-primary" type="submit" disabled={busy === "create-draw"}>{busy === "create-draw" ? <LoaderCircle size={16} /> : <Plus size={16} />} 뽑기 생성</button>
      </form>

      {draws.map((draw) => (
        <article className="panel draw-admin-card" key={draw.id}>
          <header className="draw-admin-head">
            <div><div className="flex items-center gap-1 wrap"><h2 className="panel-title mb-0">{draw.name}</h2><StatusBadge status={draw.status} /></div><p className="panel-description mt-1">{draw.description || "설명 없음"} · 연출 {(draw.animation_ms / 1000).toFixed(0)}초</p></div>
            <div className="table-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => editDraw(draw)}><Edit3 size={14} /> 수정</button>
              {draw.status !== "ACTIVE" && <button className="btn btn-success btn-sm" onClick={() => patchDraw(draw, { status: "ACTIVE" })} disabled={busy === draw.id}><CirclePlay size={14} /> 시작</button>}
              {draw.status === "ACTIVE" && <button className="btn btn-secondary btn-sm" onClick={() => patchDraw(draw, { status: "PAUSED" })} disabled={busy === draw.id}><CirclePause size={14} /> 일시정지</button>}
              {draw.status !== "ENDED" && <button className="btn btn-danger btn-sm" onClick={() => patchDraw(draw, { status: "ENDED" })} disabled={busy === draw.id}><Archive size={14} /> 종료</button>}
            </div>
          </header>
          <div className="draw-admin-body grid grid-2">
            <section>
              <h3 className="panel-title">상품 관리</h3>
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 620 }}>
                  <thead><tr><th>상품</th><th>확률</th><th>재고</th><th>속성</th><th>관리</th></tr></thead>
                  <tbody>
                    {(draw.rewards ?? []).map((reward) => (
                      <tr key={reward.id}>
                        <td><strong style={{ color: reward.color }}>{reward.name}</strong><div className="text-muted text-small">{reward.description}</div></td>
                        <td>{formatPercent(probabilityToPercent(reward.probability_units), 4)}</td>
                        <td>{reward.stock ?? "∞"}</td>
                        <td className="muted">{reward.is_exchange_material ? "교환 재료" : reward.is_inventory_item ? "보관 상품" : "기록 전용"}</td>
                        <td><div className="table-actions"><button className="btn btn-secondary btn-sm" onClick={() => editReward(reward)}><Edit3 size={13} /></button><button className="btn btn-danger btn-sm" onClick={() => deleteReward(reward)}><Trash2 size={13} /></button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="form-grid mt-3" onSubmit={(event) => createReward(event, draw.id)}>
                <div className="form-row">
                  <div className="field"><label>새 상품명</label><input className="input" name="name" required maxLength={80} placeholder="상품명" /></div>
                  <div className="field"><label>색상</label><input className="input" name="color" type="color" defaultValue="#38bdf8" /></div>
                </div>
                <div className="form-row">
                  <div className="field"><label>설명</label><input className="input" name="description" maxLength={300} placeholder="상품 설명" /></div>
                  <div className="field"><label>재고</label><input className="input" name="stock" type="number" min="0" placeholder="비우면 무제한" /></div>
                </div>
                <div className="flex wrap gap-2"><label className="checkbox-row"><input type="checkbox" name="isInventoryItem" defaultChecked /> 회원 보유 상품</label><label className="checkbox-row"><input type="checkbox" name="isExchangeMaterial" /> 교환 재료</label></div>
                <button className="btn btn-secondary" type="submit" disabled={busy === `reward-${draw.id}`}><Gift size={16} /> 상품 추가</button>
              </form>
            </section>
            <section>
              <h3 className="panel-title">확률 관리</h3>
              <p className="panel-description mb-0">합계가 정확히 100%일 때만 저장됩니다. 모든 변경은 삭제 불가능한 기록으로 남습니다.</p>
              <div className="mt-3"><ProbabilityEditor draw={draw} /></div>
            </section>
          </div>
        </article>
      ))}
    </div>
  );
}
