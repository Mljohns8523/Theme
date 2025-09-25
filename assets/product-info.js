if (!customElements.get('product-info')) {
  customElements.define(
    'product-info',
    class ProductInfo extends HTMLElement {
      quantityInput = undefined;
      quantityForm = undefined;
      onVariantChangeUnsubscriber = undefined;
      cartUpdateUnsubscriber = undefined;
      abortController = undefined;
      pendingRequestUrl = null;
      preProcessHtmlCallbacks = [];
      postProcessHtmlCallbacks = [];
      lastProcessedVariantId = null;
      selectedVariantOverride = null;

      constructor() {
        super();
        this.quantityInput = this.querySelector('.quantity__input');
      }

      connectedCallback() {
        this.initializeProductSwapUtility();
        this.onVariantChangeUnsubscriber = subscribe(
          PUB_SUB_EVENTS.optionValueSelectionChange,
          this.handleOptionValueChange.bind(this)
        );
        this.initQuantityHandlers();
        this.dispatchEvent(new CustomEvent('product-info:loaded', { bubbles: true }));
      }

      addPreProcessCallback(callback) {
        this.preProcessHtmlCallbacks.push(callback);
      }

      initQuantityHandlers() {
        if (!this.quantityInput) return;
        this.quantityForm = this.querySelector('.product-form__quantity');
        if (!this.quantityForm) return;
        this.setQuantityBoundries();
        if (!this.dataset.originalSection) {
          this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, this.fetchQuantityRules.bind(this));
        }
      }

      disconnectedCallback() {
        this.onVariantChangeUnsubscriber();
        this.cartUpdateUnsubscriber?.();
      }

      initializeProductSwapUtility() {
        this.preProcessHtmlCallbacks.push((html) =>
          html.querySelectorAll('.scroll-trigger').forEach((element) => element.classList.add('scroll-trigger--cancel'))
        );
        this.postProcessHtmlCallbacks.push((newNode) => {
          window?.Shopify?.PaymentButton?.init();
          window?.ProductModel?.loadShopifyXR();
        });
      }

      handleOptionValueChange({ data: { event, target, selectedOptionValues } }) {
        if (!this.contains(event.target)) return;
        const clickedRadio = event.target.closest('input[type="radio"]');
        const selectedVariantId = clickedRadio ? clickedRadio.value : this.getSelectedVariant(this)?.id;

        console.log('Clicked radio value (variant ID):', selectedVariantId || 'Not found'); // Debug

        if (selectedVariantId === this.lastProcessedVariantId) {
          console.log('Skipping duplicate variant change for ID:', selectedVariantId);
          return;
        }
        this.lastProcessedVariantId = selectedVariantId;
        this.selectedVariantOverride = selectedVariantId;

        this.resetProductFormState();
        const productUrl = target.dataset.productUrl || this.pendingRequestUrl || this.dataset.url;
        this.pendingRequestUrl = productUrl;
        const shouldSwapProduct = this.dataset.url !== productUrl;
        const shouldFetchFullPage = this.dataset.updateUrl === 'true' && shouldSwapProduct;

        if (clickedRadio && clickedRadio.name) {
          const escapedName = clickedRadio.name.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
          const radioGroup = this.variantSelectors.querySelectorAll(`input[name="${escapedName}"]`);
          radioGroup.forEach(radio => {
            radio.checked = radio === clickedRadio;
          });
        }

        this.renderProductInfo({
          requestUrl: this.buildRequestUrlWithParams(productUrl, selectedOptionValues, shouldFetchFullPage, selectedVariantId),
          targetId: target.id,
          callback: shouldSwapProduct
            ? this.handleSwapProduct(productUrl, shouldFetchFullPage)
            : this.handleUpdateProductInfo(productUrl, selectedVariantId),
        });
      }

      resetProductFormState() {
        const productForm = this.productForm;
        if (productForm && typeof productForm.toggleSubmitButton === 'function') {
          productForm.toggleSubmitButton(true);
        } else {
          console.warn('toggleSubmitButton is not a function on productForm. Check product-form custom element definition.');
          const submitButtons = productForm?.querySelectorAll('button[type="submit"], button#AddToCart, button#BuyNow');
          if (submitButtons) {
            submitButtons.forEach(button => {
              button.disabled = true;
              button.classList.add('disabled');
            });
          }
        }
        if (productForm && typeof productForm.handleErrorMessage === 'function') {
          productForm.handleErrorMessage();
        }
      }

      handleSwapProduct(productUrl, updateFullPage) {
        return (html) => {
          this.productModal?.remove();
          const selector = updateFullPage ? "product-info[id^='MainProduct']" : 'product-info';
          const variant = this.getSelectedVariant(html.querySelector(selector));
          this.updateURL(productUrl, variant?.id);

          if (updateFullPage) {
            document.querySelector('head title').innerHTML = html.querySelector('head title').innerHTML;
            HTMLUpdateUtility.viewTransition(
              document.querySelector('main'),
              html.querySelector('main'),
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          } else {
            HTMLUpdateUtility.viewTransition(
              this,
              html.querySelector('product-info'),
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          }
        };
      }

      renderProductInfo({ requestUrl, targetId, callback }) {
        console.log('Fetching URL:', requestUrl); // Debug
        this.abortController?.abort();
        this.abortController = new AbortController();

        fetch(requestUrl, { signal: this.abortController.signal })
          .then((response) => response.text())
          .then((responseText) => {
            this.pendingRequestUrl = null;
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            callback(html);
          })
          .then(() => {
            document.querySelector(`#${targetId}`)?.focus();
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            } else {
              console.error(error);
            }
          });
      }

      getSelectedVariant(productInfoNode) {
        const selectedVariant = productInfoNode.querySelector('variant-selects [data-selected-variant]')?.innerHTML;
        return selectedVariant ? JSON.parse(selectedVariant) : null;
      }

      buildRequestUrlWithParams(url, optionValues, shouldFetchFullPage = false, selectedVariantId = null) {
        const params = [];
        !shouldFetchFullPage && params.push(`section_id=${this.sectionId}`);
        if (optionValues.length) {
          params.push(`option_values=${optionValues.join(',')}`);
        }
        let finalUrl = url;
        if (selectedVariantId) {
          finalUrl = `${url}${url.includes('?') ? '&' : '?'}variant=${selectedVariantId}`;
        }
        if (params.length) {
          finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${params.join('&')}`;
        }
        return finalUrl;
      }

      updateOptionValues(html, selectedVariantId) {
        const variantSelects = html.querySelector('variant-selects');
        if (variantSelects) {
          const currentSelection = this.selectedVariantOverride || this.variantSelectors.querySelector('input[type="radio"]:checked')?.value;
          console.log('Updating options with selectedVariantId:', currentSelection); // Debug
          HTMLUpdateUtility.viewTransition(this.variantSelectors, variantSelects, this.preProcessHtmlCallbacks);

          const variantDataElement = this.variantSelectors.querySelector('[data-selected-variant]');
          let variantData = variantDataElement?.innerHTML ? JSON.parse(variantDataElement.innerHTML) : null;
          const variantOptions = this.variantSelectors.querySelector('[data-variants]')?.innerHTML;
          const allVariants = variantOptions ? JSON.parse(variantOptions) : [];

          if (this.selectedVariantOverride && variantData && variantData.id.toString() !== this.selectedVariantOverride.toString()) {
            variantData = allVariants.find(v => v.id.toString() === this.selectedVariantOverride.toString());
            console.log('Overriding variant data in updateOptionValues:', variantData); // Debug
            if (variantData && variantDataElement) {
              variantDataElement.innerHTML = JSON.stringify(variantData);
            }
          }

          if (variantData && allVariants.length) {
            const selectedVariant = allVariants.find(v => v.id.toString() === variantData.id.toString());
            if (selectedVariant) {
              const options = this.variantSelectors.querySelectorAll('fieldset');
              options.forEach((fieldset, index) => {
                const optionName = fieldset.querySelector('legend')?.innerText.split(':')[0].trim().toLowerCase();
                const selectedValueSpan = fieldset.querySelector('[data-selected-value]');
                if (selectedValueSpan && optionName) {
                  const optionValue = selectedVariant.options[index];
                  if (optionName.includes('color') && optionValue) {
                    console.log('Setting color label for', optionName, 'to:', optionValue); // Debug
                    selectedValueSpan.innerText = optionValue;
                  }
                }
              });
            }
          }

          if (currentSelection) {
            const newInput = this.variantSelectors.querySelector(`input[type="radio"][value="${currentSelection}"]`);
            if (newInput && !newInput.disabled) {
              newInput.checked = true;
            } else {
              console.warn('No matching radio input found for current selection:', currentSelection);
              // Fallback: Select first available variant
              const firstAvailableInput = this.variantSelectors.querySelector('input[type="radio"]:not(.disabled)');
              if (firstAvailableInput) {
                console.log('Fallback: Selecting first available variant in updateOptionValues:', firstAvailableInput.value);
                firstAvailableInput.checked = true;
                this.updateVariantInputs(firstAvailableInput.value);
              }
            }
          }
          this.dispatchEvent(new CustomEvent('variant-selects:updated', { bubbles: true }));
        }
      }

      handleUpdateProductInfo(productUrl, selectedVariantId) {
        return (html) => {
          let variant = this.getSelectedVariant(html);
          console.log('Fetched variant:', variant, 'Available:', variant?.available); // Debug

          const variantOptions = this.variantSelectors.querySelector('[data-variants]')?.innerHTML;
          const allVariants = variantOptions ? JSON.parse(variantOptions) : [];
          if (this.selectedVariantOverride && variant && variant.id.toString() !== this.selectedVariantOverride.toString()) {
            variant = allVariants.find(v => v.id.toString() === this.selectedVariantOverride.toString());
            console.log('Overriding fetched variant with:', variant); // Debug
          }

          if (!variant) {
            console.warn('No variant found, setting unavailable');
            this.setUnavailable();
            // Fallback: Select first available variant
            const firstAvailableInput = this.variantSelectors.querySelector('input[type="radio"]:not(.disabled)');
            if (firstAvailableInput) {
              console.log('Fallback: Selecting first available variant:', firstAvailableInput.value);
              firstAvailableInput.checked = true;
              this.updateVariantInputs(firstAvailableInput.value);
              variant = allVariants.find(v => v.id.toString() === firstAvailableInput.value);
              if (variant && this.variantSelectors.querySelector('[data-selected-variant]')) {
                this.variantSelectors.querySelector('[data-selected-variant]').innerHTML = JSON.stringify(variant);
              }
            } else {
              console.warn('No available variants found');
              return;
            }
          }

          this.pickupAvailability?.update(variant);
          this.updateOptionValues(html, selectedVariantId);
          this.updateURL(productUrl, variant?.id);
          this.updateVariantInputs(variant?.id);

          if (!variant) {
            this.setUnavailable();
            return;
          }

          // Update media with fallback
          this.updateMedia(html, variant?.featured_media?.id || null);

          const updateSourceFromDestination = (id, shouldHide = (source) => false) => {
            const source = html.getElementById(`${id}-${this.sectionId}`);
            const destination = this.querySelector(`#${id}-${this.dataset.section}`);
            if (source && destination) {
              destination.innerHTML = source.innerHTML;
              destination.classList.toggle('hidden', shouldHide(source));
            }
          };

          updateSourceFromDestination('price');
          updateSourceFromDestination('Sku', ({ classList }) => classList.contains('hidden'));
          updateSourceFromDestination('Inventory', ({ innerText }) => innerText === '');
          updateSourceFromDestination('Volume');
          updateSourceFromDestination('Price-Per-Item', ({ classList }) => classList.contains('hidden'));

          this.updateQuantityRules(this.sectionId, html);
          this.querySelector(`#Quantity-Rules-${this.dataset.section}`)?.classList.remove('hidden');
          this.querySelector(`#Volume-Note-${this.dataset.section}`)?.classList.remove('hidden');

          const productForm = this.productForm;
          if (productForm && typeof productForm.toggleSubmitButton === 'function') {
            console.log('Toggling submit button - Variant available:', variant.available); // Debug
            productForm.toggleSubmitButton(!variant.available, variant.available ? '' : window.variantStrings.soldOut);
          } else {
            console.warn('Product form or toggleSubmitButton not found');
            const submitButtons = productForm?.querySelectorAll('button[type="submit"], button#AddToCart, button#BuyNow');
            if (submitButtons) {
              submitButtons.forEach(button => {
                button.disabled = !variant.available;
                button.classList.toggle('disabled', !variant.available);
              });
            }
          }

          // Force button enable if variant is available
          if (variant.available) {
            const submitButtons = productForm?.querySelectorAll('button[type="submit"], button#AddToCart, button#BuyNow');
            if (submitButtons) {
              submitButtons.forEach(button => {
                button.disabled = false;
                button.classList.remove('disabled');
              });
            }
          }

          publish(PUB_SUB_EVENTS.variantChange, {
            data: {
              sectionId: this.sectionId,
              html,
              variant,
            },
          });

          this.selectedVariantOverride = null;
        };
      }

      updateVariantInputs(variantId, retryCount = 0) {
        const maxRetries = 6;
        const retryDelay = 300; // Increased to 300ms

        this.querySelectorAll(
          `#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}`
        ).forEach((productForm) => {
          const input = productForm.querySelector('input[name="id"]');
          if (input) {
            console.log('Updating form input:', input, 'to value:', variantId); // Debug
            input.value = variantId ?? '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        const radioInputs = this.variantSelectors.querySelectorAll('input[type="radio"]');
        let updated = false;
        radioInputs.forEach(input => {
          const inputVariantId = input.value;
          if (inputVariantId && inputVariantId === variantId && !input.disabled) {
            input.checked = true;
            updated = true;
          } else if (input.checked && inputVariantId !== variantId) {
            input.checked = false;
          }
        });

        if (!updated && variantId) {
          console.warn('No matching variant found for ID:', variantId, 'Retry count:', retryCount);
          if (retryCount < maxRetries) {
            // Retry after a delay
            setTimeout(() => this.updateVariantInputs(variantId, retryCount + 1), retryDelay);
            return;
          }
          // Fallback: Select first available variant
          const firstAvailableInput = radioInputs.find(input => !input.disabled);
          if (firstAvailableInput) {
            console.log('Fallback: Selected first available variant:', firstAvailableInput.value); // Debug
            firstAvailableInput.checked = true;
            this.querySelectorAll(
              `#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}`
            ).forEach((productForm) => {
              const input = productForm.querySelector('input[name="id"]');
              if (input) {
                input.value = firstAvailableInput.value;
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
            const variantDataElement = this.variantSelectors.querySelector('[data-selected-variant]');
            if (variantDataElement) {
              const allVariants = JSON.parse(this.variantSelectors.querySelector('[data-variants]')?.innerHTML || '[]');
              const selectedVariant = allVariants.find(v => v.id.toString() === firstAvailableInput.value);
              if (selectedVariant) {
                variantDataElement.innerHTML = JSON.stringify(selectedVariant);
                console.log('Updated variant-selects data to:', selectedVariant);
              }
            }
            // Force button enable
            const productForm = this.productForm;
            const submitButtons = productForm?.querySelectorAll('button[type="submit"], button#AddToCart, button#BuyNow');
            if (submitButtons) {
              submitButtons.forEach(button => {
                button.disabled = false;
                button.classList.remove('disabled');
              });
            }
          }
        } else {
          console.log('Variant input updated to:', variantId); // Debug
          // Ensure buttons are enabled
          const productForm = this.productForm;
          const submitButtons = productForm?.querySelectorAll('button[type="submit"], button#AddToCart, button#BuyNow');
          if (submitButtons) {
            submitButtons.forEach(button => {
              button.disabled = false;
              button.classList.remove('disabled');
            });
          }
        }
      }

      updateURL(url, variantId) {
        this.querySelector('share-button')?.updateUrl(
          `${window.shopUrl}${url}${variantId ? `?variant=${variantId}` : ''}`
        );
        if (this.dataset.updateUrl === 'false') return;
        window.history.replaceState({}, '', `${url}${variantId ? `?variant=${variantId}` : ''}`);
      }

      setUnavailable() {
        const productForm = this.productForm;
        if (productForm && typeof productForm.toggleSubmitButton === 'function') {
          productForm.toggleSubmitButton(true, window.variantStrings.unavailable);
        } else {
          console.warn('Product form or toggleSubmitButton not found');
          const submitButtons = productForm?.querySelectorAll('button[type="submit"], button#AddToCart, button#BuyNow');
          if (submitButtons) {
            submitButtons.forEach(button => {
              button.disabled = true;
              button.classList.add('disabled');
            });
          }
        }
        const selectors = ['price', 'Inventory', 'Sku', 'Price-Per-Item', 'Volume-Note', 'Volume', 'Quantity-Rules']
          .map((id) => `#${id}-${this.dataset.section}`)
          .join(', ');
        document.querySelectorAll(selectors).forEach(({ classList }) => classList.add('hidden'));
      }

      updateMedia(html, variantFeaturedMediaId) {
        console.log('Updating media for variant ID:', variantFeaturedMediaId); // Debug
        if (!variantFeaturedMediaId) {
          console.warn('No featured media ID for variant, skipping media update');
          return;
        }

        const mediaGallerySource = this.querySelector('media-gallery ul');
        const mediaGalleryDestination = html.querySelector(`media-gallery ul`);

        const refreshSourceData = () => {
          if (this.hasAttribute('data-zoom-on-hover')) enableZoomOnHover(2);
          const mediaGallerySourceItems = Array.from(mediaGallerySource.querySelectorAll('li[data-media-id]'));
          const sourceSet = new Set(mediaGallerySourceItems.map((item) => item.dataset.mediaId));
          const sourceMap = new Map(
            mediaGallerySourceItems.map((item, index) => [item.dataset.mediaId, { item, index }])
          );
          return [mediaGallerySourceItems, sourceSet, sourceMap];
        };

        if (mediaGallerySource && mediaGalleryDestination) {
          let [mediaGallerySourceItems, sourceSet, sourceMap] = refreshSourceData();
          const mediaGalleryDestinationItems = Array.from(
            mediaGalleryDestination.querySelectorAll('li[data-media-id]')
          );
          const destinationSet = new Set(mediaGalleryDestinationItems.map(({ dataset }) => dataset.mediaId));
          let shouldRefresh = false;

          for (let i = mediaGalleryDestinationItems.length - 1; i >= 0; i--) {
            if (!sourceSet.has(mediaGalleryDestinationItems[i].dataset.mediaId)) {
              mediaGallerySource.prepend(mediaGalleryDestinationItems[i]);
              shouldRefresh = true;
            }
          }

          for (let i = 0; i < mediaGallerySourceItems.length; i++) {
            if (!destinationSet.has(mediaGallerySourceItems[i].dataset.mediaId)) {
              mediaGallerySourceItems[i].remove();
              shouldRefresh = true;
            }
          }

          if (shouldRefresh) [mediaGallerySourceItems, sourceSet, sourceMap] = refreshSourceData();

          mediaGalleryDestinationItems.forEach((destinationItem, destinationIndex) => {
            const sourceData = sourceMap.get(destinationItem.dataset.mediaId);
            if (sourceData && sourceData.index !== destinationIndex) {
              mediaGallerySource.insertBefore(
                sourceData.item,
                mediaGallerySource.querySelector(`li:nth-of-type(${destinationIndex + 1})`)
              );
              [mediaGallerySourceItems, sourceSet, sourceMap] = refreshSourceData();
            }
          });
        }

        this.querySelector(`media-gallery`)?.setActiveMedia?.(
          `${this.dataset.section}-${variantFeaturedMediaId}`,
          true
        );

        const modalContent = this.productModal?.querySelector(`.product-media-modal__content`);
        const newModalContent = html.querySelector(`product-modal .product-media-modal__content`);
        if (modalContent && newModalContent) modalContent.innerHTML = newModalContent.innerHTML;
      }

      setQuantityBoundries() {
        const data = {
          cartQuantity: this.quantityInput.dataset.cartQuantity ? parseInt(this.quantityInput.dataset.cartQuantity) : 0,
          min: this.quantityInput.dataset.min ? parseInt(this.quantityInput.dataset.min) : 1,
          max: this.quantityInput.dataset.max ? parseInt(this.quantityInput.dataset.max) : null,
          step: this.quantityInput.step ? parseInt(this.quantityInput.step) : 1,
        };

        let min = data.min;
        const max = data.max === null ? data.max : data.max - data.cartQuantity;
        if (max !== null) min = Math.min(min, max);
        if (data.cartQuantity >= data.min) min = Math.min(min, data.step);

        this.quantityInput.min = min;
        if (max) {
          this.quantityInput.max = max;
        } else {
          this.quantityInput.removeAttribute('max');
        }
        this.quantityInput.value = min;

        publish(PUB_SUB_EVENTS.quantityUpdate, undefined);
      }

      fetchQuantityRules() {
        const currentVariantId = this.productForm?.variantIdInput?.value;
        if (!currentVariantId) return;

        this.querySelector('.quantity__rules-cart .loading__spinner').classList.remove('hidden');
        return fetch(`${this.dataset.url}?variant=${currentVariantId}&section_id=${this.dataset.section}`)
          .then((response) => response.text())
          .then((responseText) => {
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            this.updateQuantityRules(this.dataset.section, html);
          })
          .catch((e) => console.error(e))
          .finally(() => this.querySelector('.quantity__rules-cart .loading__spinner').classList.add('hidden'));
      }

      updateQuantityRules(sectionId, html) {
        if (!this.quantityInput) return;
        this.setQuantityBoundries();

        const quantityFormUpdated = html.getElementById(`Quantity-Form-${sectionId}`);
        const selectors = ['.quantity__input', '.quantity__rules', '.quantity__label'];
        for (let selector of selectors) {
          const current = this.quantityForm.querySelector(selector);
          const updated = quantityFormUpdated.querySelector(selector);
          if (!current || !updated) continue;
          if (selector === '.quantity__input') {
            const attributes = ['data-cart-quantity', 'data-min', 'data-max', 'step'];
            for (let attribute of attributes) {
              const valueUpdated = updated.getAttribute(attribute);
              if (valueUpdated !== null) {
                current.setAttribute(attribute, valueUpdated);
              } else {
                current.removeAttribute(attribute);
              }
            }
          } else {
            current.innerHTML = updated.innerHTML;
          }
        }
      }

      get productForm() {
        return this.querySelector(`product-form`);
      }

      get productModal() {
        return document.querySelector(`#ProductModal-${this.dataset.section}`);
      }

      get pickupAvailability() {
        return this.querySelector(`pickup-availability`);
      }

      get variantSelectors() {
        return this.querySelector('variant-selects');
      }

      get relatedProducts() {
        const relatedProductsSectionId = SectionId.getIdForSection(
          SectionId.parseId(this.sectionId),
          'related-products'
        );
        return document.querySelector(`product-recommendations[data-section-id^="${relatedProductsSectionId}"]`);
      }

      get quickOrderList() {
        const quickOrderListSectionId = SectionId.getIdForSection(
          SectionId.parseId(this.sectionId),
          'quick_order_list'
        );
        return document.querySelector(`quick-order-list[data-id^="${quickOrderListSectionId}"]`);
      }

      get sectionId() {
        return this.dataset.originalSection || this.dataset.section;
      }
    }
  );
}

/* === Titan Variant Fix – robust radio->variant sync === */
(function(){
  function getSelectedOptions(form){
    var opts = [];
    for (var i=1;i<=3;i++){
      var radios = form.querySelectorAll('input[name="option'+i+'"]');
      if (radios.length){
        var checked = Array.from(radios).find(r=>r.checked);
        opts[i-1] = checked ? checked.value : null;
      } else {
        var sel = form.querySelector('select[name="option'+i+'"]');
        opts[i-1] = sel ? sel.value : null;
      }
    }
    return opts;
  }
  function findVariantId(product, opts){
    if(!product || !product.variants) return null;
    return (product.variants.find(v=>{
      return (!opts[0] || v.option1===opts[0]) &&
             (!opts[1] || v.option2===opts[1]) &&
             (!opts[2] || v.option3===opts[2]);
    })||{}).id || null;
  }
  function syncFormVariantId(form){
    try{
      var meta = window.meta || window.ShopifyAnalytics && ShopifyAnalytics.meta || {};
      var product = (meta.product) ? meta.product : (window.__PRODUCT_JSON__ || null);
      var opts = getSelectedOptions(form);
      var vid = findVariantId(product, opts);
      var idInput = form.querySelector('input[name="id"]');
      if(idInput && vid){
        idInput.value = String(vid);
        var addBtn = form.querySelector('button[name="add"], .product-form__submit, button[type="submit"]');
        if(addBtn){ addBtn.removeAttribute('disabled'); addBtn.removeAttribute('aria-disabled'); }
      }
    }catch(e){ /* swallow */ }
  }
  document.addEventListener('change', function(e){
    var tgt = e.target;
    if(!tgt.closest) return;
    var fs = tgt.closest('fieldset.js.product-form__input, .product-form__input-pills');
    var form = tgt.closest && tgt.closest('form[action*="/cart/add"]');
    if(fs && form){ syncFormVariantId(form); }
  }, true);
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('form[action*="/cart/add"]').forEach(syncFormVariantId);
  });
})();
