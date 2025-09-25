document.addEventListener('DOMContentLoaded', () => {
  // Reviews: Star toggle
  document.querySelectorAll('.rated-excellent-stars i').forEach(star => {
    star.addEventListener('click', () => {
      star.style.color = star.style.color === 'rgba(var(--color-button), var(--alpha-button-background))' ? '#ccc' : 'rgba(var(--color-button), var(--alpha-button-background))';
    });
  });

  // Estimated Delivery: Date calculation
  document.querySelectorAll('.delivery-info').forEach(info => {
    const blockId = info.id.replace('delivery-info-', '');
    const days = parseInt(info.querySelector('strong').textContent.match(/\d+/)[0], 10);
    const today = new Date();
    const deliveryDate = new Date(today);
    deliveryDate.setDate(today.getDate() + days);
    const options = { month: 'short', day: 'numeric' };
    document.getElementById(`delivery-date-${blockId}`).textContent = deliveryDate.toLocaleDateString(undefined, options);
  });
});