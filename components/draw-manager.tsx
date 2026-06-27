"use client";

import { Archive, CirclePause, CirclePlay, Edit3, Gift, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { ProbabilityEditor } from "@/components/probability-editor";
import { StatusBadge } from "@/components/status-badge";
import type { Draw, ProductCatalogItem, Reward } from "@/lib/types";
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

async function readPngFile(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.type !== "image/png") throw new Error("PNG 파일만 등록할 수 있습니다.");
  if (file.size > 900 * 1024) throw new Error("PNG 파일은 900KB 이하만 등록해 주세요.");
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

export function DrawManager({ draws, products }: { draws: Draw[]; products: ProductCatalogItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [productIdByDraw, setProductIdByDraw] = useState<Record<string, string>>({});
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const activeProducts = useMemo(() => products.filter((product) => product.is_active && !product.deleted_at), [products]);

  async function handleProductFile(event: ChangeEvent<HTMLInputElement>) {
    try {
      const preview = await readPngFile(event.target.files?.[0] ?? null);
      setProductPreview(preview);
    } catch (error) {
      event.target.value = "";
      setProductPreview(null);
      window.alert((error as Error).message);
    }
  }

  async function createDraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("create-draw");
    try {
      await jsonRequest("/api/admin/draws", "POST", {
        name: form.get("name"),
        description: form.get("description"),
        animationMs: Number(form.get("animationMs")),
      });
      window.alert("뽑기를 생성했습니다.");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("create-product");
    try {
      const imageFile = form.get("imageFile") instanceof File ? form.get("imageFile") as File : null;
      const imageUrl = await readPngFile(imageFile);
      await jsonRequest("/api/admin/products", "POST", {
        name: form.get("name"),
        description: form.get("description"),
        imageUrl,
        color: form.get("color"),
        defaultStock: form.get("defaultStock") ? Number(form.get("defaultStock")) : null,
        isInventoryItem: form.get("isInventoryItem") === "on",
        isExchangeMaterial: form.get("isExchangeMaterial") === "on",
      });
      setProductPreview(null);
      formElement.querySelectorAll("input").forEach((input) => {
        if (input.type === "file") input.value = "";
        if (["text", "number"].includes(input.type) && input.name !== "name") input.value = "";
      });
      window.alert("상품을 추가했습니다.");
      router.refresh();
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function patchDraw(draw: Draw, patch: Record<string, unknown>) {
    setBusy(draw.id);
    try { await jsonRequest(`/api/admin/draws/${draw.id}`, "PATCH", patch); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function deleteDraw(draw: Draw) {
    if (!window.confirm(`“${draw.name}” 뽑기를 삭제할까요? 공개 목록에서 제거되고 결과 기록은 보존됩니다.`)) return;
    setBusy(draw.id);
    try { await jsonRequest(`/api/admin/draws/${draw.id}`, "DELETE"); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function editDraw(draw: Draw) {
    const name = window.prompt("뽑기 이름", draw.name);
    if (!name) return;
    const description = window.prompt("뽑기 설명", draw.description ?? "") ?? draw.description;
    await patchDraw(draw, { name, description });
  }

  async function attachProduct(draw: Draw) {
    const productId = productIdByDraw[draw.id] || activeProducts[0]?.id;
    if (!productId) return window.alert("먼저 상품 보관함에 상품을 추가해 주세요.");
    setBusy(`attach-${draw.id}`);
    try { await jsonRequest(`/api/admin/draws/${draw.id}/attach-product`, "POST", { productId }); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function editReward(reward: Reward) {
    const stockText = window.prompt("재고 수량 (무제한은 비워두기)", reward.stock === null || reward.stock === undefined ? "" : String(reward.stock));
    setBusy(reward.id);
    try {
      await jsonRequest(`/api/admin/rewards/${reward.id}`, "PATCH", { stock: stockText === "" || stockText === null ? null : Number(stockText) });
      router.refresh();
    } catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function deleteReward(reward: Reward) {
    if (!window.confirm(`“${reward.name}”을 이 뽑기에서 삭제할까요? 상품 보관함 원본은 유지됩니다.`)) return;
    setBusy(reward.id);
    try { await jsonRequest(`/api/admin/rewards/${reward.id}`, "DELETE"); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function toggleProduct(product: ProductCatalogItem) {
    setBusy(product.id);
    try { await jsonRequest(`/api/admin/products/${product.id}`, "PATCH", { isActive: !product.is_active }); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  async function deleteProduct(product: ProductCatalogItem) {
    if (!window.confirm(`“${product.name}” 상품을 보관함에서 삭제할까요? 뽑기에 연결된 경우 먼저 연결을 해제해야 합니다.`)) return;
    setBusy(product.id);
    try { await jsonRequest(`/api/admin/products/${product.id}`, "DELETE"); router.refresh(); }
    catch (error) { window.alert((error as Error).message); }
    finally { setBusy(null); }
  }

  return <div className="grid draw-redesign-admin">
    <section className="panel panel-pad operation-note"><h2>상품 보관함 기반 운영</h2><p>상품을 먼저 만들고, 필요한 뽑기에 연결해 확률을 설정합니다.</p></section>
    <div className="grid grid-2">
      <form className="panel panel-pad form-grid" onSubmit={createProduct}>
        <h2 className="panel-title">상품 보관함에 상품 추가</h2>
        <div className="form-row"><div className="field"><label>상품명</label><input className="input" name="name" required maxLength={80} placeholder="예: Dynamic 입장권" /></div><div className="field"><label>색상</label><input className="input" name="color" type="color" defaultValue="#111111" /></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" maxLength={300} placeholder="상품 설명" /></div>
        <div className="form-row"><div className="field"><label>기본 재고</label><input className="input" name="defaultStock" type="number" min="0" placeholder="비우면 무제한" /></div><div className="field"><label>PNG 파일</label><input className="input" name="imageFile" type="file" accept="image/png" onChange={handleProductFile} /><small>룰렛·결과 화면에 사용할 PNG 파일을 직접 넣습니다. 900KB 이하 권장.</small></div></div>
        {productPreview && <div className="upload-preview"><img src={productPreview} alt="상품 이미지 미리보기" /><span>PNG 미리보기</span></div>}
        <div className="flex wrap gap-2"><label className="checkbox-row"><input type="checkbox" name="isInventoryItem" defaultChecked /> 회원 보유 상품</label><label className="checkbox-row"><input type="checkbox" name="isExchangeMaterial" /> 교환 재료</label></div>
        <button className="btn btn-primary" type="submit" disabled={busy === "create-product"}>{busy === "create-product" ? <LoaderCircle size={16} className="spin" /> : <><Upload size={16} /><Plus size={16} /></>} 상품 추가</button>
      </form>

      <form className="panel panel-pad form-grid" onSubmit={createDraw}>
        <h2 className="panel-title">새 뽑기 만들기</h2>
        <div className="form-row"><div className="field"><label>뽑기 이름</label><input className="input" name="name" required maxLength={80} placeholder="예: 5만냥 입장권 추첨" /></div><div className="field"><label>연출 시간</label><select className="select" name="animationMs" defaultValue="4000"><option value="3000">3초</option><option value="4000">4초</option><option value="5000">5초</option></select></div></div>
        <div className="field"><label>설명</label><input className="input" name="description" maxLength={300} placeholder="사용자에게 표시할 설명" /></div>
        <button className="btn btn-secondary" type="submit" disabled={busy === "create-draw"}>{busy === "create-draw" ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} 뽑기 생성</button>
      </form>
    </div>

    <section className="panel panel-pad"><h2 className="panel-title">상품 보관함</h2><div className="table-wrap mt-3"><table className="table"><thead><tr><th>상품</th><th>속성</th><th>기본 재고</th><th>상태</th><th>관리</th></tr></thead><tbody>{products.length ? products.map((product) => <tr key={product.id}><td><strong style={{ color: product.color }}>{product.name}</strong><div className="text-muted text-small">{product.description ?? "설명 없음"}{product.image_url ? " · PNG 등록" : ""}</div></td><td>{product.is_exchange_material ? "교환 재료" : product.is_inventory_item ? "보유 상품" : "기록 전용"}</td><td>{product.default_stock ?? "∞"}</td><td>{product.is_active ? "사용" : "정지"}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => toggleProduct(product)}>{product.is_active ? "정지" : "복구"}</button><button className="btn btn-danger btn-sm" type="button" onClick={() => deleteProduct(product)}><Trash2 size={13} /> 삭제</button></div></td></tr>) : <tr><td colSpan={5}><div className="empty">상품 보관함이 비어 있습니다.</div></td></tr>}</tbody></table></div></section>

    {draws.length ? draws.map((draw) => <article className="panel draw-admin-card" key={draw.id}><header className="draw-admin-head"><div><div className="flex items-center gap-1 wrap"><h2 className="panel-title mb-0">{draw.name}</h2><StatusBadge status={draw.status} /></div><p className="panel-description mt-1">{draw.description || "설명 없음"} · 연출 {(draw.animation_ms / 1000).toFixed(0)}초</p></div><div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => editDraw(draw)}><Edit3 size={14} /> 수정</button>{draw.status !== "ACTIVE" && <button className="btn btn-success btn-sm" type="button" onClick={() => patchDraw(draw, { status: "ACTIVE" })} disabled={busy === draw.id}><CirclePlay size={14} /> 시작</button>}{draw.status === "ACTIVE" && <button className="btn btn-secondary btn-sm" type="button" onClick={() => patchDraw(draw, { status: "PAUSED" })} disabled={busy === draw.id}><CirclePause size={14} /> 일시정지</button>}{draw.status !== "ENDED" && <button className="btn btn-danger btn-sm" type="button" onClick={() => patchDraw(draw, { status: "ENDED" })} disabled={busy === draw.id}><Archive size={14} /> 종료</button>}<button className="btn btn-danger btn-sm" type="button" onClick={() => deleteDraw(draw)} disabled={busy === draw.id}><Trash2 size={14} /> 삭제</button></div></header><div className="draw-admin-body grid grid-2"><section><h3 className="panel-title">이 뽑기에 연결된 상품</h3><div className="table-wrap"><table className="table" style={{ minWidth: 620 }}><thead><tr><th>상품</th><th>확률</th><th>재고</th><th>속성</th><th>관리</th></tr></thead><tbody>{(draw.rewards ?? []).filter((reward) => reward.is_active && !reward.deleted_at).map((reward) => <tr key={reward.id}><td><strong style={{ color: reward.color }}>{reward.name}</strong><div className="text-muted text-small">{reward.description}{reward.image_url ? " · PNG 등록" : ""}</div></td><td>{formatPercent(probabilityToPercent(reward.probability_units), 4)}</td><td>{reward.stock ?? "∞"}</td><td className="muted">{reward.is_exchange_material ? "교환 재료" : reward.is_inventory_item ? "보관 상품" : "기록 전용"}</td><td><div className="table-actions"><button className="btn btn-secondary btn-sm" type="button" onClick={() => editReward(reward)}><Edit3 size={13} /></button><button className="btn btn-danger btn-sm" type="button" onClick={() => deleteReward(reward)}><Trash2 size={13} /></button></div></td></tr>)}{!(draw.rewards ?? []).filter((reward) => reward.is_active && !reward.deleted_at).length && <tr><td colSpan={5}><div className="empty">아직 연결된 상품이 없습니다.</div></td></tr>}</tbody></table></div><div className="form-row mt-3"><div className="field"><label>상품 보관함에서 선택</label><select className="select" value={productIdByDraw[draw.id] ?? activeProducts[0]?.id ?? ""} onChange={(event) => setProductIdByDraw((value) => ({ ...value, [draw.id]: event.target.value }))}>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div><div className="field"><label>&nbsp;</label><button className="btn btn-secondary" type="button" onClick={() => attachProduct(draw)} disabled={busy === `attach-${draw.id}` || !activeProducts.length}><Gift size={16} /> 뽑기에 상품 연결</button></div></div></section><section><h3 className="panel-title">확률 관리</h3><p className="panel-description mb-0">합계가 정확히 100%일 때만 저장됩니다.</p><div className="mt-3"><ProbabilityEditor draw={draw} /></div></section></div></article>) : <section className="panel panel-pad empty">아직 생성된 뽑기가 없습니다. 상품 보관함을 만든 뒤 새 뽑기를 생성하세요.</section>}
  </div>;
}
