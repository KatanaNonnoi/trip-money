# 🧳 กองกลางทริป

เว็บสรุปเงินกองกลางทริป: รายชื่อสมาชิก ยอดที่จ่าย ค่าใช้จ่าย เงินเหลือ/ขาด และสรุปหารเท่ากัน

- **หน้าเว็บ**: HTML/CSS/JS ล้วน ไม่ต้อง build → โฮสต์ฟรีบน **GitHub Pages**
- **ฐานข้อมูล**: **Google Sheets** ผ่าน **Google Apps Script** (ฟรี)
- ถ้ายังไม่เชื่อม Sheet เว็บจะเปิดใน “โหมดทดลอง” (เก็บข้อมูลในเบราว์เซอร์ + มีข้อมูลตัวอย่าง)

```
index.html        หน้าเว็บ
style.css         ดีไซน์
app.js            logic + คำนวณ
config.js         ใส่ URL ของ Apps Script
apps-script/Code.gs   โค้ดฝั่ง Google Sheet
```

---

## 1) ตั้งค่า Google Sheet (ฐานข้อมูล)

1. สร้าง Google Sheet ใหม่ที่ <https://sheets.new>
2. เมนู **Extensions → Apps Script**
3. ลบโค้ดเดิม แล้ววางโค้ดจาก [`apps-script/Code.gs`](apps-script/Code.gs) → กด 💾 Save
4. (แนะนำ) ตั้งรหัสแก้ไขที่บรรทัด `const EDIT_KEY = '';` เช่น `'trip2026'` ป้องกันคนอื่นแก้ข้อมูล
5. เลือกฟังก์ชัน `setup` ด้านบน → กด **Run** → อนุญาตสิทธิ์ (Advanced → Go to … (unsafe) → Allow)
   ระบบจะสร้างชีต `members`, `expenses`, `settings` ให้
6. กด **Deploy → New deployment** → ⚙ เลือกประเภท **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. กด Deploy แล้ว **คัดลอก Web app URL** (ลงท้ายด้วย `/exec`)
8. เปิด [`config.js`](config.js) แล้ววาง URL:
   ```js
   window.TRIP_CONFIG = {
     API_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec',
   };
   ```

> ⚠️ ถ้าแก้ `Code.gs` ภายหลัง ต้อง **Deploy → Manage deployments → ✏️ → Version: New version** ทุกครั้ง ไม่งั้นโค้ดใหม่จะไม่ทำงาน

## 2) Deploy ขึ้น GitHub Pages (ฟรี)

```bash
git init
git add .
git commit -m "Trip money web"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

จากนั้นใน GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**
รอ 1–2 นาที เว็บจะอยู่ที่ `https://<username>.github.io/<repo>/`

## 3) การใช้งาน

- **⚙ ตั้งค่า**: ชื่อทริป, ยอดเก็บต่อคน (ค่าเริ่มต้นตอนเพิ่มสมาชิก), รหัสแก้ไข (ต้องตรงกับ `EDIT_KEY`)
- **สมาชิก**: เพิ่ม/แก้ไข/ลบ, ปุ่ม **＋ จ่าย** สำหรับบันทึกเงินที่รับเพิ่ม, กรองตามสถานะ จ่ายครบ / บางส่วน / ยังไม่จ่าย
- **ค่าใช้จ่าย**: เพิ่มรายการพร้อมหมวดหมู่ แสดงสัดส่วนตามหมวด และยอดรวม
- **เทียบยอด**: เงินที่เก็บได้ − ค่าใช้จ่าย → เหลือ/ขาดกี่บาท, ต้องเก็บเพิ่มเฉลี่ยคนละเท่าไร, และคาดการณ์ถ้าทุกคนจ่ายครบ
- **สรุปหารเท่ากัน**: ค่าใช้จ่ายรวม ÷ จำนวนคน แล้วบอกรายคนว่า “ต้องจ่ายเพิ่ม” หรือ “ได้คืน” กี่บาท

## หมายเหตุ

- ทุกคนที่มีลิงก์เว็บ **ดู** ข้อมูลได้ ถ้าตั้ง `EDIT_KEY` คนที่ **แก้ไข** ได้ต้องใส่รหัสในหน้าตั้งค่าก่อน (เก็บไว้ในเบราว์เซอร์ของแต่ละคน)
- URL ของ Apps Script จะอยู่ในโค้ดบน GitHub แบบสาธารณะ จึงควรตั้ง `EDIT_KEY` เสมอ
- แก้ข้อมูลตรงใน Google Sheet ได้เลย (อย่าแก้คอลัมน์ `id`)
