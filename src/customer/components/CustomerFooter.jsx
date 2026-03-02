export default function CustomerFooter() {
  return (
    <footer className="mt-16 bg-[#2f3e2f] text-white">
      <div className="max-w-6xl mx-auto px-6 py-12 grid gap-8 md:grid-cols-3">
        <div className="space-y-3 text-xs uppercase tracking-[0.3em] text-[#c8d4c1] font-['Montserrat']">
          <p>Term & Conditions</p>
          <p>Shipping Policy</p>
          <p>Refund & Refund</p>
          <p>Contact</p>
        </div>
        <div className="text-sm text-[#e6efe0] space-y-2">
          <p className="uppercase tracking-[0.2em] text-[#c8d4c1] text-xs font-['Montserrat']">Visit us</p>
          <p className="font-medium">Brgy. Palo-Alto, Calamba City, Laguna, Philippines, 2028</p>
          <p className="font-medium">0976 197 2581</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-4 text-sm text-[#e6efe0]">
          <p className="uppercase tracking-[0.35em] text-xs font-['Montserrat']">Sign up now!</p>
          <div className="flex gap-3">
            <button className="h-10 w-10 rounded-full border border-[#516153] hover:bg-[#3c4a3a]" aria-label="Instagram" />
            <button className="h-10 w-10 rounded-full border border-[#516153] hover:bg-[#3c4a3a]" aria-label="Website" />
            <button className="h-10 w-10 rounded-full border border-[#516153] hover:bg-[#3c4a3a]" aria-label="Facebook" />
          </div>
        </div>
      </div>
      <div className="border-t border-[#3f4f3e] py-4 text-center text-xs text-[#b7c2b0]">
        (c) 2026 Belfiore Succulents. All rights reserved.
      </div>
    </footer>
  );
}
