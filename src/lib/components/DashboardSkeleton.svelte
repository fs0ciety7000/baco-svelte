<div class="min-h-screen flex flex-col bg-deep-space animate-pulse">
  
  <div class="mx-4 mt-4 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center px-6 justify-between">
    <div class="h-10 w-32 bg-white/10 rounded-lg"></div>
    
    <div class="hidden md:flex gap-4">
      <div class="h-10 w-24 bg-white/10 rounded-xl"></div>
      <div class="h-10 w-24 bg-white/10 rounded-xl"></div>
      <div class="h-10 w-24 bg-white/10 rounded-xl"></div>
      <div class="h-10 w-24 bg-white/10 rounded-xl"></div>
    </div>

    <div class="flex gap-3">
      <div class="h-10 w-10 bg-white/10 rounded-xl"></div>
      <div class="h-10 w-10 bg-white/10 rounded-full"></div>
    </div>
  </div>

  <main class="container mx-auto px-4 py-8 flex-grow space-y-8">
    
    <div class="h-8 w-64 bg-white/10 rounded-lg"></div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      
      <div class="col-span-1 lg:col-span-2 h-64 rounded-3xl bg-white/5 border border-white/10 p-6 space-y-4">
        <div class="flex justify-between">
            <div class="h-6 w-32 bg-white/10 rounded"></div>
            <div class="h-6 w-6 bg-white/10 rounded"></div>
        </div>
        <div class="space-y-2 pt-4">
            <div class="h-4 w-full bg-white/5 rounded"></div>
            <div class="h-4 w-5/6 bg-white/5 rounded"></div>
            <div class="h-4 w-4/6 bg-white/5 rounded"></div>
        </div>
      </div>

      <div class="h-64 rounded-3xl bg-white/5 border border-white/10 p-6 space-y-4">
        <div class="h-6 w-24 bg-white/10 rounded mb-4"></div>
        <div class="space-y-3">
             <div class="flex gap-3">
                 <div class="w-8 h-8 rounded-full bg-white/10"></div>
                 <div class="flex-1 space-y-1">
                     <div class="h-3 w-full bg-white/10 rounded"></div>
                     <div class="h-2 w-2/3 bg-white/5 rounded"></div>
                 </div>
             </div>
             <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-white/10"></div>
                <div class="flex-1 space-y-1">
                    <div class="h-3 w-full bg-white/10 rounded"></div>
                    <div class="h-2 w-2/3 bg-white/5 rounded"></div>
                </div>
            </div>
        </div>
      </div>

      {#each Array(3) as _}
      <div class="h-48 rounded-3xl bg-white/5 border border-white/10"></div>
      {/each}

    </div>
  </main>
</div>