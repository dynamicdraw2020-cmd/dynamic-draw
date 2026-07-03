"use client";

import { Download, ImagePlus, LoaderCircle, RefreshCw } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, currentY);
}

export function ResultImageGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [title, setTitle] = useState("𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 추첨 결과");
  const [winner, setWinner] = useState("당첨 회원명");
  const [prize, setPrize] = useState("당첨 상품명");
  const [message, setMessage] = useState("당첨을 축하드립니다. 자세한 안내는 공식 공지 채널을 확인해 주세요.");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);

  function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png") return window.alert("PNG 파일만 업로드해 주세요.");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setImage(img);
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function render() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = 1200, h = 675;
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = "#f7f9fc"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff"; drawRoundedRect(ctx, 72, 66, 1056, 543, 34); ctx.fill();
    ctx.strokeStyle = "#d9e2ef"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#0f2a43"; ctx.font = "800 34px Arial, sans-serif"; ctx.fillText("𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃", 112, 126);
    ctx.fillStyle = "#33516b"; ctx.font = "700 22px Arial, sans-serif"; ctx.fillText("공식 이벤트 결과 안내", 112, 164);
    if (image) {
      const boxX = 792, boxY = 122, boxW = 268, boxH = 268;
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 28); ctx.save(); ctx.clip();
      const ratio = Math.max(boxW / image.width, boxH / image.height);
      const iw = image.width * ratio, ih = image.height * ratio;
      ctx.drawImage(image, boxX + (boxW - iw) / 2, boxY + (boxH - ih) / 2, iw, ih);
      ctx.restore();
    } else {
      ctx.fillStyle = "#e9eef5"; drawRoundedRect(ctx, 792, 122, 268, 268, 28); ctx.fill();
      ctx.fillStyle = "#71859a"; ctx.font = "700 24px Arial, sans-serif"; ctx.fillText("PNG 이미지 영역", 830, 260);
    }
    ctx.fillStyle = "#102033"; ctx.font = "900 56px Arial, sans-serif"; wrapText(ctx, title, 112, 256, 620, 64);
    ctx.fillStyle = "#1d4ed8"; ctx.font = "900 46px Arial, sans-serif"; ctx.fillText(winner, 112, 414);
    ctx.fillStyle = "#102033"; ctx.font = "800 34px Arial, sans-serif"; ctx.fillText(prize, 112, 466);
    ctx.fillStyle = "#53657a"; ctx.font = "500 24px Arial, sans-serif"; wrapText(ctx, message, 112, 532, 900, 34);
    ctx.fillStyle = "#e2e8f0"; drawRoundedRect(ctx, 794, 438, 266, 82, 18); ctx.fill();
    ctx.fillStyle = "#102033"; ctx.font = "800 24px Arial, sans-serif"; ctx.fillText("dynamic2020.com", 834, 488);
  }

  useEffect(() => { render(); });

  function download() {
    setBusy(true);
    render();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `dynamic-d-result-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    window.setTimeout(() => setBusy(false), 250);
  }

  return <div className="result-image-tool">
    <section className="panel panel-pad form-grid">
      <div><h2 className="panel-title">결과 공개 이미지 만들기</h2><p className="panel-description">디스코드·오픈채팅 공지용 이미지를 브라우저에서 바로 만듭니다. 업로드한 PNG는 서버에 저장하지 않습니다.</p></div>
      <div className="field"><label>제목</label><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} /></div>
      <div className="form-row"><div className="field"><label>당첨자 문구</label><input className="input" value={winner} onChange={(event) => setWinner(event.target.value)} maxLength={60} /></div><div className="field"><label>상품 문구</label><input className="input" value={prize} onChange={(event) => setPrize(event.target.value)} maxLength={80} /></div></div>
      <div className="field"><label>안내 문구</label><textarea className="textarea" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={220} rows={4} /></div>
      <label className="btn btn-secondary file-upload-button"><ImagePlus size={17} /> PNG 사진 넣기<input type="file" accept="image/png" onChange={onUpload} hidden /></label>
      <div className="table-actions"><button className="btn btn-secondary" type="button" onClick={render}><RefreshCw size={16} /> 미리보기 새로고침</button><button className="btn btn-primary" type="button" onClick={download} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} PNG 다운로드</button></div>
    </section>
    <section className="panel panel-pad"><h2 className="panel-title">미리보기</h2><canvas ref={canvasRef} className="result-image-canvas" /></section>
  </div>;
}
