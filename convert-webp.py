"""
把資料夾裡的圖片轉成 WebP（動態 GIF 會轉成動態 WebP）。

用法：在這個資料夾按住 Shift 右鍵 →「在此處開啟 PowerShell」，然後輸入：
    python convert-webp.py

之後新增圖片後再跑一次就好，已經轉過的會自動跳過。

想調整畫質，改下面的 QUALITY（數字越大越清晰、檔案越大）。
"""

import sys
import os
from PIL import Image, ImageSequence

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ===================== 設定 =====================
QUALITY = 75          # 畫質 0-100，建議 70~85
METHOD = 4            # 壓縮力道 0-6，越大越慢但檔案越小
MAX_WIDTH = 0         # 設成例如 800 可同時縮圖；0 = 不改變尺寸
EXTS = (".gif", ".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff")
# ===============================================

folder = os.path.dirname(os.path.abspath(__file__))


def mb(path):
    return os.path.getsize(path) / 1048576


def resize_if_needed(img):
    if MAX_WIDTH and img.width > MAX_WIDTH:
        h = round(img.height * MAX_WIDTH / img.width)
        return img.resize((MAX_WIDTH, h), Image.LANCZOS)
    return img


def convert(src, dst):
    im = Image.open(src)
    frames = getattr(im, "n_frames", 1)

    if frames > 1:
        # 動畫：逐幀處理後存成動態 WebP
        durations = []
        images = []
        for frame in ImageSequence.Iterator(im):
            durations.append(frame.info.get("duration", 100))
            images.append(resize_if_needed(frame.convert("RGBA")))
        images[0].save(
            dst,
            format="WEBP",
            save_all=True,
            append_images=images[1:],
            duration=durations,
            loop=im.info.get("loop", 0),
            quality=QUALITY,
            method=METHOD,
        )
    else:
        # 靜態圖
        img = resize_if_needed(im)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        img.save(dst, format="WEBP", quality=QUALITY, method=METHOD)

    return frames


def main():
    files = sorted(
        f for f in os.listdir(folder)
        if f.lower().endswith(EXTS) and os.path.isfile(os.path.join(folder, f))
    )

    if not files:
        print("這個資料夾沒有找到圖片檔。")
        return

    total_before = total_after = 0
    done = skipped = 0

    for name in files:
        src = os.path.join(folder, name)
        dst = os.path.join(folder, os.path.splitext(name)[0] + ".webp")

        # 已經轉過而且原圖沒更新過 → 跳過
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            print(f"跳過   {name}（已轉換過）")
            skipped += 1
            continue

        before = mb(src)
        print(f"轉換中 {name} ... ", end="", flush=True)
        try:
            frames = convert(src, dst)
        except Exception as e:
            print(f"失敗：{e}")
            continue

        after = mb(dst)
        total_before += before
        total_after += after
        done += 1
        saved = (1 - after / before) * 100 if before else 0
        kind = f"{frames} 幀動畫" if frames > 1 else "靜態圖"
        print(f"完成（{kind}）  {before:.1f}MB → {after:.1f}MB，省下 {saved:.0f}%")

    print()
    print(f"共轉換 {done} 個檔案，跳過 {skipped} 個。")
    if done:
        print(f"總計 {total_before:.1f}MB → {total_after:.1f}MB"
              f"（省下 {(1 - total_after / total_before) * 100:.0f}%）")
        print("\n記得把 index.html 裡 HERO_IMAGES 的副檔名改成 .webp")


if __name__ == "__main__":
    main()
