export function Footer() {
  return (
    <footer className="border-t border-border py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="./favicon.svg" alt="山淮筑" className="w-6 h-6" />
            <span className="text-xl font-bold text-foreground">山淮筑</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2026 宁波山淮科技有限公司
          </p>
        </div>
      </div>
    </footer>
  );
}
