export function TopBar() {
  return (
    <div className="h-10 border-b border-neutral-800/80 flex items-center px-4 justify-between bg-[#131316] z-10 shrink-0 text-xs">
       <div className="flex items-center gap-6">
         <div className="font-medium text-neutral-200 flex items-center gap-2">
           <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-blue-500" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 22 2 22"></polygon></svg>
           <span className="text-sm">DeckFrame</span>
         </div>
         <div className="flex gap-4 text-neutral-400 font-medium ml-4">
           <span className="hover:text-white cursor-pointer">File</span>
           <span className="hover:text-white cursor-pointer">Edit</span>
           <span className="hover:text-white cursor-pointer">View</span>
           <span className="hover:text-white cursor-pointer">Window</span>
         </div>
       </div>
       <div className="flex items-center gap-3">
         <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden">
            {/* Avatar placeholder */}
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-neutral-500 p-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
         </div>
       </div>
    </div>
  )
}
