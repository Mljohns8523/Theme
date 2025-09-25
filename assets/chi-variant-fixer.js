
(() => {
  function norm(v){ return (v==null? "" : String(v)).trim().toLowerCase(); }

  function initForSection(root){
    try{
      const form = root.querySelector('form[action*="/cart/add"]');
      if(!form) return;
      const idInput = form.querySelector('input[name="id"]');
      if(!idInput) return;
      const addBtn = form.querySelector('button[name="add"], button[type="submit"], .product-form__submit');
      // variants json
      const variantsScript = root.querySelector('script[type="application/json"][data-variants]') 
                           || root.querySelector('variant-selects script[type="application/json"]')
                           || root.querySelector('script[data-variants]');
      let variants = [];
      if(variantsScript){
        try { variants = JSON.parse(variantsScript.textContent || '[]'); } catch(e){ variants = []; }
      }
      // normalize map for fast lookup
      const index = new Map();
      variants.forEach(v => {
        const k = [norm(v.option1), norm(v.option2), norm(v.option3)].join('|');
        index.set(k, v);
      });

      function currentSelection(){
        const res = { option1:"", option2:"", option3:"" };
        for (let i=1;i<=3;i++){
          // pick checked radio in this section by name
          const inp = root.querySelector(`input[type="radio"][name="option${i}"]:checked`);
          if(inp){
            const dv = inp.getAttribute('data-value') || inp.getAttribute('value') || "";
            res[`option${i}`] = dv;
          }
        }
        return res;
      }
      function findVariant(sel){
        const key = [norm(sel.option1), norm(sel.option2), norm(sel.option3)].join('|');
        return index.get(key);
      }
      function update(){
        const sel = currentSelection();
        const v = findVariant(sel);
        if(v){
          idInput.value = String(v.id);
          // enable button if available
          if(addBtn){
            addBtn.disabled = !v.available;
            if(addBtn.hasAttribute('aria-disabled')) addBtn.removeAttribute('aria-disabled');
            addBtn.classList.toggle('disabled', !v.available);
          }
          // reflect in URL
          try {
            const url = new URL(location.href);
            url.searchParams.set('variant', v.id);
            history.replaceState({}, '', url.toString());
          } catch(e){}
        } else {
          // no exact match, disable
          if(addBtn){
            addBtn.disabled = true;
            addBtn.classList.add('disabled');
          }
        }
        // signal for other scripts
        root.dispatchEvent(new CustomEvent('chi:variant-updated', { detail: { id: idInput.value } }));
      }

      // events
      root.addEventListener('change', (e) => {
        const t = e.target;
        if(t && t.matches && t.matches('input[type="radio"][name^="option"]')){
          update();
        }
      });
      // initial
      update();
    }catch(err){
      console.error('chi-variant-fixer error:', err);
    }
  }

  // If script is injected inside section, init that section only
  const here = document.currentScript && document.currentScript.closest('section');
  if(here){
    initForSection(here);
  } else {
    document.querySelectorAll('section').forEach(initForSection);
  }
})();
