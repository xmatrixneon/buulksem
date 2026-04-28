"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Check, X, Zap, Search, RefreshCw, MessageSquare, Power, PowerOff, Layers, CheckCircle2, XCircle, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Service {
  id: string;
  name: string;
  code: string;
  format: any[];
  image: string;
  multisms: boolean;
  maxmessage: number;
  active: boolean;
}

export default function ServicesPageWithTRPC() {
  const trpc = useTRPC();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newFormatInput, setNewFormatInput] = useState("");

  // tRPC query for fetching services
  const {
    data: services = [],
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.services.all.queryOptions(),
    refetchOnWindowFocus: false,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    ...trpc.services.delete.mutationOptions(),
    onSuccess: () => {
      console.log('[Services] Delete mutation succeeded');
      toast.success("Service deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
    },
    onError: (error: any) => {
      console.error('[Services] Delete mutation failed:', error);
      toast.error(`Failed to delete service: ${error.message}`);
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    ...trpc.services.edit.mutationOptions(),
    onSuccess: () => {
      console.log('[Services] Edit mutation succeeded');
      toast.success("Service updated successfully");
      refetch();
      setEditDialogOpen(false);
      setEditService(null);
      setNewFormatInput("");
    },
    onError: (error: any) => {
      console.error('[Services] Edit mutation failed:', error);
      toast.error(`Failed to update service: ${error.message}`);
    },
  });

  const openEditDialog = (service: Service) => {
    console.log('[Services] Opening edit dialog for service:', service.id, service.name);
    // Deep clone to avoid reference issues
    setEditService({
      id: service.id,
      name: service.name,
      code: service.code,
      format: Array.isArray(service.format) ? [...service.format] : [],
      image: service.image || "",
      multisms: service.multisms,
      maxmessage: service.maxmessage,
      active: service.active,
    });
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    console.log('[Services] Closing edit dialog');
    setEditDialogOpen(false);
    setEditService(null);
    setNewFormatInput("");
  };

  const handleChange = (field: keyof Service, value: any) => {
    console.log('[Services] Changing field:', field, 'to:', value);
    setEditService((prev) => prev ? { ...prev, [field]: value } : null);
  };

  const addFormat = () => {
    if (!newFormatInput.trim()) {
      toast.error("Please enter a format pattern");
      return;
    }
    if (!editService) return;

    setEditService({
      ...editService,
      format: [...(editService.format || []), newFormatInput.trim()]
    });
    setNewFormatInput("");
    toast.success("Format added");
  };

  const removeFormat = (index: number) => {
    if (!editService) return;
    const newFormats = [...(editService.format || [])];
    newFormats.splice(index, 1);
    setEditService({
      ...editService,
      format: newFormats
    });
  };

  const saveEdit = async () => {
    if (!editService) return;
    if (!editService.name || !editService.code) {
      toast.error("Please fill all required fields");
      return;
    }
    if (!editService.format || editService.format.length === 0) {
      toast.error("Please add at least one format pattern");
      return;
    }

    console.log('[Services] Saving edit for service:', editService.id);

    await editMutation.mutateAsync({
      id: editService.id,
      name: editService.name,
      code: editService.code,
      format: editService.format,
      image: editService.image || "",
      multisms: editService.multisms ?? true,
      maxmessage: editService.maxmessage ?? 0,
      active: editService.active ?? true,
    });
  };

  const openDeleteDialog = (id: string) => {
    console.log('[Services] Opening delete dialog for service:', id);
    setServiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!serviceToDelete) return;
    await deleteMutation.mutateAsync({ id: serviceToDelete });
  };

  // Filter services
  const filteredServices = services.filter((service: any) =>
    service.name.toLowerCase().includes(search.toLowerCase()) ||
    service.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8" />
            Services
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Manage OTP services and their formats
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/addservice">
              <Plus className="h-4 w-4 mr-2" />
              Add Service
            </Link>
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Icon</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Multi-SMS</TableHead>
                  <TableHead>Max Msgs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="animate-pulse text-muted-foreground">Loading services...</div>
                    </TableCell>
                  </TableRow>
                ) : filteredServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="text-muted-foreground">No services found</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServices.map((service: any) => (
                    <TableRow key={service.id}>
                      <TableCell>
                        {service.image ? (
                          <img src={service.image} alt={service.name} className="w-6 h-6 rounded" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{service.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{service.code}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground max-w-md truncate">
                          {service.format && Array.isArray(service.format) ? (
                            <span>{service.format.length} format(s)</span>
                          ) : (
                            <span className="italic">No formats</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={service.multisms ? "default" : "secondary"}>
                          {service.multisms ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {service.maxmessage || 0}
                      </TableCell>
                      <TableCell>
                        <Badge variant={service.active ? "default" : "secondary"}>
                          {service.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(service)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(service.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Service</DialogTitle>
            <DialogDescription>
              Update service information and OTP format patterns
            </DialogDescription>
          </DialogHeader>

          {editService && (
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Service Name *</Label>
                  <Input
                    id="name"
                    value={editService.name || ""}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Airtel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code">Service Code *</Label>
                  <Input
                    id="code"
                    value={editService.code || ""}
                    onChange={(e) => handleChange("code", e.target.value)}
                    placeholder="airtel"
                    className="lowercase"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Image URL</Label>
                <Input
                  id="image"
                  value={editService.image || ""}
                  onChange={(e) => handleChange("image", e.target.value)}
                  placeholder="https://example.com/icon.png"
                />
              </div>

              {/* Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxmessage">Max Messages</Label>
                  <Input
                    id="maxmessage"
                    type="number"
                    value={editService.maxmessage ?? 0}
                    onChange={(e) => handleChange("maxmessage", parseInt(e.target.value) || 0)}
                    min="0"
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum OTP messages to accept
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Multi-SMS</Label>
                  <Button
                    type="button"
                    variant={editService.multisms ? "default" : "secondary"}
                    size="sm"
                    onClick={() => handleChange("multisms", !editService.multisms)}
                    className="w-full"
                  >
                    {editService.multisms ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Disabled
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Accept multiple OTP messages
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Button
                    type="button"
                    variant={editService.active ? "default" : "secondary"}
                    size="sm"
                    onClick={() => handleChange("active", !editService.active)}
                    className="w-full"
                  >
                    {editService.active ? (
                      <>
                        <Power className="h-4 w-4 mr-2" />
                        Active
                      </>
                    ) : (
                      <>
                        <PowerOff className="h-4 w-4 mr-2" />
                        Inactive
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Service availability status
                  </p>
                </div>
              </div>

              {/* Format Patterns */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>OTP Format Patterns *</Label>
                    <span className="text-xs text-muted-foreground">
                      {editService.format?.length || 0} pattern(s)
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Define patterns to extract OTP from SMS. Use <code>{'{otp}'}</code> for the OTP code.
                  </p>
                </div>

                {/* Add new format */}
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g., Your OTP is {otp}. Valid for {time} secs."
                    value={newFormatInput}
                    onChange={(e) => setNewFormatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFormat()}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={addFormat}
                    disabled={!newFormatInput.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>

                {/* Format list */}
                <div className="space-y-2">
                  {editService.format && editService.format.length > 0 ? (
                    editService.format.map((format: string, index: number) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-md">
                        <code className="flex-1 text-sm font-mono break-all">
                          {format}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFormat(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-sm text-muted-foreground border rounded-md border-dashed">
                      No format patterns. Add at least one pattern.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeEditDialog}
              disabled={editMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This action cannot be undone. This will permanently delete the service ${
                serviceToDelete && services.find((s: any) => s.id === serviceToDelete)?.name
              }.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
